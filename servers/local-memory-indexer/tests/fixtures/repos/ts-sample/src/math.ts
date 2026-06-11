export function add(a: number, b: number): number {
  const result = a + b;
  return result;
}

export function subtract(a: number, b: number): number {
  const result = a - b;
  return result;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export class Calculator {
  private _value = 0;

  add(n: number): this {
    this._value += n;
    return this;
  }

  subtract(n: number): this {
    this._value -= n;
    return this;
  }

  multiply(n: number): this {
    this._value *= n;
    return this;
  }

  reset(): this {
    this._value = 0;
    return this;
  }

  result(): number {
    return this._value;
  }
}
