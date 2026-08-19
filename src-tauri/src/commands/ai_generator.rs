// ai_generator.rs — AI Economy Generator (Fáze 7 nových funkcí).
//
// SECURITY DESIGN (viz SECURITY.md): GSS nemá žádný vlastní AI backend a
// nebude vymýšlet neexistující infrastrukturu. Místo toho jde o
// "bring your own key" (BYOK) model — uživatel zadá VLASTNÍ Anthropic API
// klíč (získaný na console.anthropic.com), GSS ho pouze bezpečně uloží
// lokálně (tauri-plugin-store, stejný store soubor jako licence, NIKDY
// localStorage) a používá ho pro volání Anthropic API přímo z Rustu
// (ne z WebView — konzistentní s tím, jak GSS už volá itch.io API).
//
// Klíč se nikdy neposílá zpátky do JS po uložení — frontend se jen ptá
// "je nakonfigurován?" (has_anthropic_api_key), nikdy nečte jeho hodnotu.

use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

const STORE_KEY_AI_API_KEY: &str = "gss_ai_api_key";
const ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";

// ─── System prompt: přesně definuje očekávaný výstupní JSON formát ──────────
// Model musí vrátit POUZE JSON (žádný markdown, žádný text okolo) — frontend
// výsledek stejně vždy validuje přes GraphValidator.validate() předtím, než
// ho vloží do editoru, takže i nedokonalá odpověď modelu nikdy nespadne
// aplikaci — nanejvýš zobrazí chybu validace uživateli.
const SYSTEM_PROMPT: &str = r#"You generate GSS (Game Systems Simulator) economy graphs as strict JSON.
Output ONLY a JSON object, no markdown fences, no explanation before or after.

Schema:
{
  "name": string,
  "description": string,
  "nodes": [
    { "id": string, "type": number, "label": string, "position": {"x": number, "y": number}, "data": object }
  ],
  "connections": [
    { "from_node": string, "to_node": string, "from_port": 0, "to_port": 0 }
  ]
}

Node types and their required "data" fields:
0 = POOL: { "resource": string, "capacity": number, "initial_amount": number }
1 = SOURCE: { "resource": string, "rate": number }
2 = CONVERTER: { "input_resource": string, "input_amount": number, "output_resource": string, "output_amount": number, "cycle_time": number }
3 = DRAIN: { "resource": string, "rate": number }
4 = GATE: { "variable": string, "operator": number (0=GT,1=GTE,2=LT,3=LTE,4=EQ,5=NEQ), "value": number }
5 = CHANCE: { "success_chance": number (0-100) }
7 = SPLITTER: { "split_mode": 0|1, "output_count": number, "weights": string (e.g. "1,1") }
8 = TIMER: { "resource": string, "amount": number, "interval": number (seconds) }
9 = FORMULA: { "expression": string (only +,-,*,/,parentheses,resource names,tick — no functions), "output_resource": string }
10 = PLAYER_ACTION: { "resource": string, "amount": number, "cadence": number (avg seconds) }

Position nodes left-to-right in rough production order, spaced ~200px apart on x, varied y to avoid overlap.
Keep graphs modest: 4-12 nodes for a typical request unless the user explicitly asks for something larger."#;

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: &'static str,
    max_tokens: u32,
    system: &'static str,
    messages: Vec<AnthropicMessage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicContentBlock>,
    #[serde(default)]
    error: Option<AnthropicErrorBody>,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorBody {
    message: String,
}

/// Uloží uživatelův vlastní Anthropic API klíč lokálně (nikdy do zdrojového kódu).
#[tauri::command]
pub fn save_anthropic_api_key(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("gss.bin").map_err(|e| e.to_string())?;
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        return Err("API key cannot be empty.".to_string());
    }
    store.set(
        STORE_KEY_AI_API_KEY,
        serde_json::Value::String(trimmed),
    );
    store.save().map_err(|e| e.to_string())
}

/// Odstraní uložený klíč.
#[tauri::command]
pub fn clear_anthropic_api_key(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("gss.bin").map_err(|e| e.to_string())?;
    store.delete(STORE_KEY_AI_API_KEY);
    store.save().map_err(|e| e.to_string())
}

/// Vrací jen ANO/NE, jestli je klíč nakonfigurovaný — nikdy samotnou hodnotu.
#[tauri::command]
pub fn has_anthropic_api_key(app: tauri::AppHandle) -> Result<bool, String> {
    let store = app.store("gss.bin").map_err(|e| e.to_string())?;
    Ok(store
        .get(STORE_KEY_AI_API_KEY)
        .and_then(|v| v.as_str().map(|s| !s.is_empty()))
        .unwrap_or(false))
}

/// Vygeneruje GSS graf z textového popisu pomocí uživatelova vlastního
/// Anthropic API klíče. Vrací syrový text odpovědi modelu (frontend ho
/// parsuje a validuje přes GraphValidator — tato funkce negarantuje, že
/// jde o validní GSS graf).
#[tauri::command]
pub async fn generate_economy_graph(
    prompt: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let store = app.store("gss.bin").map_err(|e| e.to_string())?;
    let api_key = store
        .get(STORE_KEY_AI_API_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "No Anthropic API key configured. Add your own key in Settings → AI Generator."
                .to_string()
        })?;

    if prompt.trim().is_empty() {
        return Err("Please describe the economy you want to generate.".to_string());
    }

    let body = AnthropicRequest {
        model: ANTHROPIC_MODEL,
        // Oprava B9: 4096 tokenů mohlo být těsné pro grafy blížící se hornímu
    // doporučení v systémovém promptu (~12 uzlů s pozicemi a daty) — model
    // by odpověď oříznul uprostřed JSON, což by na frontendu vypadalo jako
    // obecná "neplatný JSON" chyba bez vysvětlení proč. 8192 dává výrazně
    // víc prostoru, aniž by šlo o nepřiměřeně drahý/pomalý požadavek.
    max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: vec![AnthropicMessage {
            role: "user",
            content: prompt,
        }],
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error calling Anthropic API: {}", e))?;

    let status = resp.status();
    let parsed: AnthropicResponse = resp
        .json()
        .await
        .map_err(|e| format!("Could not parse Anthropic API response: {}", e))?;

    if let Some(err) = parsed.error {
        return Err(format!("Anthropic API error: {}", err.message));
    }
    if !status.is_success() {
        return Err(format!("Anthropic API returned HTTP {}.", status));
    }

    let text = parsed
        .content
        .into_iter()
        .map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        return Err("Anthropic API returned an empty response.".to_string());
    }

    Ok(text)
}
