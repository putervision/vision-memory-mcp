export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    errors: { message: string }[];
  };
}

export abstract class Schema<T> {
  isOptional: boolean = false;
  defaultValue?: T;
  description?: string;

  protected clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  abstract parse(val: unknown, path?: string): T;
  abstract toJsonSchema(): any;

  describe(desc: string): this {
    const copy = this.clone();
    copy.description = desc;
    return copy;
  }

  optional(): this {
    const copy = this.clone();
    copy.isOptional = true;
    return copy;
  }

  default(val: T): this {
    const copy = this.clone();
    copy.defaultValue = val;
    return copy;
  }

  min(minVal: number, msg?: string): this {
    return this;
  }

  max(maxVal: number, msg?: string): this {
    return this;
  }

  int(): this {
    return this;
  }

  positive(): this {
    return this;
  }

  safeParse(val: unknown): ParseResult<T> {
    try {
      const data = this.parse(val);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          message: err.message || 'Validation error',
          errors: [{ message: err.message || 'Validation error' }],
        },
      };
    }
  }
}

export class StringSchema extends Schema<string> {
  parse(val: unknown, path = 'value'): string {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string') {
      throw new Error(`${path} must be a string`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'string' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class NumberSchema extends Schema<number> {
  parse(val: unknown, path = 'value'): number {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'number' || isNaN(val)) {
      throw new Error(`${path} must be a number`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'number' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class BooleanSchema extends Schema<boolean> {
  parse(val: unknown, path = 'value'): boolean {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'boolean') {
      throw new Error(`${path} must be a boolean`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'boolean' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class EnumSchema<U extends string> extends Schema<U> {
  private options: U[];

  constructor(options: U[]) {
    super();
    this.options = options;
  }

  parse(val: unknown, path = 'value'): U {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string' || !this.options.includes(val as U)) {
      throw new Error(`${path} must be one of: ${this.options.join(', ')}`);
    }
    return val as U;
  }

  toJsonSchema(): any {
    const s: any = { type: 'string', enum: this.options };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class ArraySchema<I> extends Schema<I[]> {
  private itemSchema: Schema<I>;

  constructor(itemSchema: Schema<I>) {
    super();
    this.itemSchema = itemSchema;
  }

  parse(val: unknown, path = 'value'): I[] {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (!Array.isArray(val)) {
      throw new Error(`${path} must be an array`);
    }
    return val.map((item, index) => this.itemSchema.parse(item, `${path}[${index}]`));
  }

  toJsonSchema(): any {
    const s: any = {
      type: 'array',
      items: (this.itemSchema as any).toJsonSchema ? (this.itemSchema as any).toJsonSchema() : {},
    };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class RecordSchema<V> extends Schema<Record<string, V>> {
  private valSchema: Schema<V>;

  constructor(valSchema: Schema<V>) {
    super();
    this.valSchema = valSchema;
  }

  parse(val: unknown, path = 'value'): Record<string, V> {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: Record<string, V> = {};
    for (const [key, propVal] of Object.entries(val as Record<string, unknown>)) {
      result[key] = this.valSchema.parse(propVal, `${path}.${key}`);
    }
    return result;
  }

  toJsonSchema(): any {
    const s: any = {
      type: 'object',
      additionalProperties: (this.valSchema as any).toJsonSchema
        ? (this.valSchema as any).toJsonSchema()
        : true,
    };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class ObjectSchema<T extends Record<string, Schema<any>>> extends Schema<{
  [K in keyof T]: T[K] extends Schema<infer U> ? U : never;
}> {
  private shape: T;

  constructor(shape: T) {
    super();
    this.shape = shape;
  }

  parse(
    val: unknown,
    path = 'value'
  ): { [K in keyof T]: T[K] extends Schema<infer U> ? U : never } {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: any = {};
    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key];
      const fieldValue = (val as any)[key];
      if (
        fieldValue === undefined &&
        fieldSchema.defaultValue === undefined &&
        fieldSchema.isOptional
      ) {
        continue;
      }
      result[key] = fieldSchema.parse(fieldValue, `${path}.${key}`);
    }
    return result;
  }

  toJsonSchema(): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, propSchema] of Object.entries(this.shape)) {
      properties[key] = (propSchema as any).toJsonSchema ? (propSchema as any).toJsonSchema() : {};
      if (!(propSchema as any).isOptional && (propSchema as any).defaultValue === undefined) {
        required.push(key);
      }
    }
    const s: any = { type: 'object', properties };
    if (required.length > 0) s.required = required;
    if (this.description) s.description = this.description;
    return s;
  }

  passthrough(): this {
    return this;
  }
}

export class UnknownSchema extends Schema<any> {
  parse(val: unknown): any {
    return val;
  }

  toJsonSchema(): any {
    const s: any = {};
    if (this.description) s.description = this.description;
    return s;
  }
}

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  enum: <U extends string>(options: U[]) => new EnumSchema<U>(options),
  array: <I>(itemSchema: Schema<I>) => new ArraySchema<I>(itemSchema),
  record: <V>(valSchema: Schema<V>) => new RecordSchema<V>(valSchema),
  object: <T extends Record<string, Schema<any>>>(shape: T) => new ObjectSchema<T>(shape),
  unknown: () => new UnknownSchema(),
  any: () => new UnknownSchema(),
};

export type Infer<T extends Schema<any>> = T extends Schema<infer U> ? U : never;
