// license.rs — build variant detection.
//
// GSS no longer has a runtime license-key system. FREE and PRO are decided
// at compile time via the `pro` Cargo feature (see Cargo.toml and
// .github/workflows/ci.yml build matrix) — two separate binaries, not one
// binary with a key that unlocks it. There used to be a much larger module
// here that called the itch.io API to validate a user-entered download
// key; it was removed because a client-side "is this key valid" check was
// never a real security boundary (a determined user could always just set
// isPro:true in the frontend), and it required embedding a privileged
// itch.io API key in the binary (see SECURITY.md history). Separate
// compile-time builds are strictly simpler and strictly more honest about
// what they actually guarantee.

/// Returns "pro" when compiled with --features pro, otherwise "free".
#[tauri::command]
pub fn get_build_variant() -> &'static str {
    if cfg!(feature = "pro") { "pro" } else { "free" }
}
