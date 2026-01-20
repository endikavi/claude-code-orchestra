# Testing Guide

This document describes testing patterns, setup, and conventions for Claude Code Orchestra.

## Test Stack

- **Test Runner:** Vitest
- **Assertions:** Vitest built-in
- **Mocking:** Vitest mocks
- **Coverage:** V8 via Vitest

## Running Tests

```bash
# Watch mode (development)
npm run test

# Single run
npm run test:run

# With coverage report
npm run test:coverage
```

## Project Structure

Tests are colocated with source files using `.test.ts` or `.test.tsx` suffix:

```
src/
├── main/
│   └── services/
│       ├── DataStore.ts
│       └── DataStore.test.ts
├── renderer/
│   └── components/
│       ├── MyComponent.tsx
│       └── MyComponent.test.tsx
├── shared/
│   └── types/
│       └── index.ts
└── test/
    ├── setup.ts          # Global test setup
    └── mocks/
        └── electron.ts   # Electron mocks
```

## Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
```

## Test Setup

### Global Setup (src/test/setup.ts)

```typescript
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

// Mock window.electronAPI for renderer tests
if (typeof window !== 'undefined') {
  window.electronAPI = {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    // ... other methods
  };
}
```

### Electron Mocks (src/test/mocks/electron.ts)

```typescript
export const mockElectronApp = {
  getPath: (name: string) => `/mock/${name}`,
  isPackaged: false,
  getName: () => 'claude-code-orchestra',
};

export const mockIpcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
};
```

## Testing Patterns

### Unit Testing Services

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from './DataStore';

// Mock better-sqlite3
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    })),
  })),
}));

describe('DataStore', () => {
  let dataStore: DataStore;

  beforeEach(() => {
    // Reset singleton for testing
    DataStore['instance'] = null;
    dataStore = DataStore.getInstance();
  });

  it('should create project', () => {
    const project = dataStore.createProject({
      name: 'Test Project',
      path: '/test/path',
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');
  });
});
```

### Testing React Components

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from './ProjectList';

describe('ProjectList', () => {
  it('should render projects', () => {
    const projects = [
      { id: '1', name: 'Project 1', path: '/path/1' },
      { id: '2', name: 'Project 2', path: '/path/2' },
    ];

    render(<ProjectList projects={projects} />);

    expect(screen.getByText('Project 1')).toBeInTheDocument();
    expect(screen.getByText('Project 2')).toBeInTheDocument();
  });

  it('should call onSelect when clicked', () => {
    const onSelect = vi.fn();
    const projects = [{ id: '1', name: 'Project 1', path: '/path/1' }];

    render(<ProjectList projects={projects} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Project 1'));

    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```

### Testing Zustand Stores

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand';

describe('projectStore', () => {
  let store: ReturnType<typeof createProjectStore>;

  beforeEach(() => {
    // Create fresh store instance
    store = createStore((set, get) => ({
      projects: [],
      addProject: (project) =>
        set((state) => ({ projects: [...state.projects, project] })),
    }));
  });

  it('should add project', () => {
    store.getState().addProject({ id: '1', name: 'Test' });
    expect(store.getState().projects).toHaveLength(1);
  });
});
```

### Testing IPC Handlers

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupIpcHandlers } from './handlers';
import { ipcMain } from 'electron';

vi.mock('electron');

describe('IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register project:getAll handler', () => {
    setupIpcHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'project:getAll',
      expect.any(Function)
    );
  });
});
```

## Mocking Strategies

### Mocking Modules

```typescript
// Full module mock
vi.mock('./DataStore', () => ({
  DataStore: {
    getInstance: () => ({
      getAllProjects: vi.fn(() => []),
      createProject: vi.fn(),
    }),
  },
}));
```

### Mocking Functions

```typescript
// Spy on method
const spy = vi.spyOn(dataStore, 'createProject');

// Mock return value
spy.mockReturnValue({ id: '1', name: 'Test' });

// Mock implementation
spy.mockImplementation((data) => ({ id: 'mock-id', ...data }));
```

### Mocking Timers

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should debounce input', async () => {
  const handler = vi.fn();
  // ... setup

  vi.advanceTimersByTime(300);

  expect(handler).toHaveBeenCalledTimes(1);
});
```

## Coverage Goals

Current coverage thresholds (configured in vitest.config.ts):

| Metric     | Threshold |
|------------|-----------|
| Statements | 50%       |
| Branches   | 50%       |
| Functions  | 50%       |
| Lines      | 50%       |

Run coverage report:
```bash
npm run test:coverage
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Use descriptive test names** - `it('should return empty array when no projects exist')`
3. **Keep tests isolated** - Each test should be independent
4. **Avoid testing external dependencies** - Mock them instead
5. **Test edge cases** - Empty inputs, errors, boundaries
6. **Use setup/teardown** - `beforeEach`/`afterEach` for common setup

## Debugging Tests

```bash
# Run specific test file
npx vitest run src/main/services/DataStore.test.ts

# Run tests matching pattern
npx vitest run --grep "should create"

# Debug mode
npx vitest --inspect-brk
```
