import { vi } from 'vitest';

/**
 * Mock for better-sqlite3 Statement
 */
export interface MockStatement {
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  pluck: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock better-sqlite3 statement
 */
export function createMockStatement(overrides?: Partial<MockStatement>): MockStatement {
  const mockStatement: MockStatement = {
    run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
    pluck: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return mockStatement;
}

/**
 * Mock for better-sqlite3 Database
 */
export interface MockDatabase {
  prepare: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  pragma: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock better-sqlite3 database
 */
export function createMockDatabase(overrides?: Partial<MockDatabase>): MockDatabase {
  const mockStatement = createMockStatement();

  const mockDatabase: MockDatabase = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    exec: vi.fn(),
    pragma: vi.fn().mockReturnValue([]),
    close: vi.fn(),
    transaction: vi.fn((fn) => fn),
    ...overrides,
  };

  return mockDatabase;
}

/**
 * Mock for the entire better-sqlite3 module
 */
export function createMockDatabaseModule() {
  const mockDb = createMockDatabase();
  return vi.fn(function () {
    return mockDb;
  });
}
