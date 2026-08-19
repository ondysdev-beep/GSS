// FormulaEvaluator.ts — bezpečný parser/vyhodnocovač jednoduchých
// aritmetických výrazů pro Formula uzel (např. "level * 1.2" nebo
// "tick * 0.05 + gold * 0.01").
//
// Záměrně NEPOUŽÍVÁ eval() ani new Function() — .gss soubory se dají sdílet
// a importovat od jiných uživatelů (viz DiffViewerPanel "Nahrát soubor…",
// Community Library plán), takže vyhodnocení výrazu z cizího souboru musí
// být bezpečné i vůči záměrně škodlivému vstupu. Gramatika podporuje jen
// čísla, +, -, *, /, závorky, unární mínus a identifikátory (proměnné) —
// žádná volání funkcí, přiřazení ani přístup k objektům/globálům.

export interface FormulaError {
  message: string
  position: number
}

type TokenType = 'NUMBER' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'EOF'

interface Token {
  type: TokenType
  value: string
  position: number
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      tokens.push({ type: 'NUMBER', value: expr.slice(i, j), position: i })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++
      tokens.push({ type: 'IDENT', value: expr.slice(i, j), position: i })
      i = j
      continue
    }
    if (c === '(') { tokens.push({ type: 'LPAREN', value: c, position: i }); i++; continue }
    if (c === ')') { tokens.push({ type: 'RPAREN', value: c, position: i }); i++; continue }
    if ('+-*/'.includes(c)) { tokens.push({ type: 'OP', value: c, position: i }); i++; continue }
    throw { message: `Invalid character "${c}"`, position: i } as FormulaError
  }
  tokens.push({ type: 'EOF', value: '', position: expr.length })
  return tokens
}

// Rekurzivní sestup: expr := term (('+' | '-') term)*
//                     term := unary (('*' | '/') unary)*
//                     unary := '-' unary | primary
//                     primary := NUMBER | IDENT | '(' expr ')'
class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) { this.tokens = tokens }

  private peek(): Token { return this.tokens[this.pos] }
  private next(): Token { return this.tokens[this.pos++] }

  private expect(type: TokenType): Token {
    const t = this.next()
    if (t.type !== type) throw { message: `Expected ${type}, found "${t.value || 'end of expression'}"`, position: t.position } as FormulaError
    return t
  }

  parseExpr(variables: Record<string, number>): number {
    const result = this.expr(variables)
    this.expect('EOF')
    return result
  }

  private expr(vars: Record<string, number>): number {
    let val = this.term(vars)
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value
      const rhs = this.term(vars)
      val = op === '+' ? val + rhs : val - rhs
    }
    return val
  }

  private term(vars: Record<string, number>): number {
    let val = this.unary(vars)
    while (this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value
      const rhs = this.unary(vars)
      val = op === '*' ? val * rhs : val / rhs
    }
    return val
  }

  private unary(vars: Record<string, number>): number {
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.next()
      return -this.unary(vars)
    }
    return this.primary(vars)
  }

  private primary(vars: Record<string, number>): number {
    const t = this.peek()
    if (t.type === 'NUMBER') {
      this.next()
      return parseFloat(t.value)
    }
    if (t.type === 'IDENT') {
      this.next()
      // Kontrola typu hodnoty (ne existence vlastnosti) záměrně obchází
      // prototypový řetězec — i kdyby `vars` bylo obyčejné {} a někdo
      // napsal výraz s identifikátorem jako "constructor" nebo "toString",
      // vrácená hodnota není number, takže bezpečně spadne na 0.
      const v = vars[t.value]
      return typeof v === 'number' ? v : 0
    }
    if (t.type === 'LPAREN') {
      this.next()
      const val = this.expr(vars)
      this.expect('RPAREN')
      return val
    }
    throw { message: `Unexpected token "${t.value || 'end of expression'}"`, position: t.position } as FormulaError
  }
}

/** Vyhodnotí výraz proti dané sadě proměnných. Vyhazuje FormulaError při chybě. */
export function evaluateFormula(expression: string, variables: Record<string, number>): number {
  const tokens = tokenize(expression)
  const parser = new Parser(tokens)
  const result = parser.parseExpr(variables)
  if (!isFinite(result)) throw { message: 'Result is not a finite number (division by zero?)', position: 0 } as FormulaError
  return result
}

/** Ověří, že výraz je syntakticky validní, aniž by vyžadoval skutečné proměnné (pro GraphValidator). */
export function validateFormulaSyntax(expression: string): FormulaError | null {
  try {
    evaluateFormula(expression, new Proxy({}, { get: () => 1 }))
    return null
  } catch (err) {
    return err as FormulaError
  }
}
