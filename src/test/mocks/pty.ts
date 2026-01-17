import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Mock interface for node-pty IPty
 */
export interface MockPty {
  pid: number;
  cols: number;
  rows: number;
  process: string;
  handleFlowControl: boolean;

  // Methods
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;

  // Event methods
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;

  // Internal emitter for testing
  _emitter: EventEmitter;
  _simulateData: (data: string) => void;
  _simulateExit: (code: number, signal?: number) => void;
}

/**
 * Create a mock node-pty instance
 */
export function createMockPty(overrides?: Partial<MockPty>): MockPty {
  const emitter = new EventEmitter();
  let dataHandler: ((data: string) => void) | null = null;
  let exitHandler: ((exitData: { exitCode: number; signal?: number }) => void) | null = null;

  const mockPty: MockPty = {
    pid: 12345,
    cols: 80,
    rows: 24,
    process: 'claude',
    handleFlowControl: false,

    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),

    onData: vi.fn((callback: (data: string) => void) => {
      dataHandler = callback;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((callback: (exitData: { exitCode: number; signal?: number }) => void) => {
      exitHandler = callback;
      return { dispose: vi.fn() };
    }),

    _emitter: emitter,
    _simulateData: (data: string) => {
      if (dataHandler) {
        dataHandler(data);
      }
    },
    _simulateExit: (code: number, signal?: number) => {
      if (exitHandler) {
        exitHandler({ exitCode: code, signal });
      }
    },

    ...overrides,
  };

  return mockPty;
}

/**
 * Create a mock for the node-pty module
 */
export function createMockPtyModule() {
  const mockPty = createMockPty();
  return {
    spawn: vi.fn(() => mockPty),
    _mockPty: mockPty,
  };
}
