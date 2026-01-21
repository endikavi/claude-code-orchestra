# Contributing to Claude Code Orchestra

Thank you for your interest in contributing to Claude Code Orchestra! This document provides guidelines and information about contributing to this project.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm 9 or higher
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/endikavi/claude-code-orchestra.git
   cd claude-code-orchestra
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run electron:dev
   ```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (web preview) |
| `npm run electron:dev` | Start development mode with hot reload |
| `npm run build` | Full production build (TypeScript + Vite + Web + Electron) |
| `npm run build:vite` | Build renderer with Vite only |
| `npm run build:web` | Build standalone web client |
| `npm run build:cli` | Build headless CLI |
| `npm run electron:build` | Package Electron app for current platform |
| `npm run rebuild` | Rebuild native modules (node-pty, better-sqlite3) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix auto-fixable ESLint issues |
| `npm run lint:strict` | Run ESLint with zero warnings mode |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage report |

## Project Structure

```
claude-code-orchestra/
├── src/
│   ├── main/           # Electron main process
│   │   ├── ipc/        # IPC handlers and channels
│   │   ├── services/   # Business logic (DataStore, ProcessManager)
│   │   └── utils/      # Utility functions
│   ├── renderer/       # React renderer process
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom React hooks
│   │   └── stores/     # Zustand stores
│   ├── shared/         # Shared code between main and renderer
│   │   ├── types/      # TypeScript type definitions
│   │   └── utils/      # Shared utilities (logger)
│   └── test/           # Test setup and mocks
├── docs/               # Documentation
├── .github/            # GitHub workflows
└── resources/          # Application resources
```

### Key Files

- `src/main/index.ts` - Main process entry point
- `src/renderer/App.tsx` - Root React component
- `src/shared/types/index.ts` - Shared TypeScript interfaces
- `src/main/ipc/handlers.ts` - IPC request handlers
- `src/main/services/DataStore.ts` - SQLite database operations

## Code Style

### TypeScript

- Use TypeScript strict mode
- Define explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use `const` assertions for literal types

### React

- Use functional components with hooks
- Follow the React Hooks rules
- Use Zustand for state management
- Implement error boundaries for error handling

### Formatting

The project uses ESLint and Prettier for code formatting:

- Run `npm run lint` to check for issues
- Run `npm run lint:fix` to auto-fix issues
- Run `npm run format` to format code

Pre-commit hooks will automatically check your code before committing.

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | camelCase for `.ts`, PascalCase for `.tsx` | `dataStore.ts`, `MainContent.tsx` |
| Components | PascalCase | `ProjectList`, `InstanceModal` |
| Functions | camelCase | `createProject`, `handleClick` |
| Constants | SCREAMING_SNAKE_CASE | `IPC_CHANNELS`, `DEFAULT_MODEL` |
| Types/Interfaces | PascalCase | `Project`, `ClaudeInstance` |

## Making Changes

### Branch Naming

- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Documentation: `docs/description`
- Refactoring: `refactor/description`

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting changes
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:
```
feat(projects): add project color selection
fix(instances): resolve memory leak on instance kill
docs(readme): update installation instructions
```

## Testing

### Running Tests

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

### Writing Tests

- Place test files next to the code they test with `.test.ts` or `.test.tsx` extension
- Use descriptive test names
- Follow the Arrange-Act-Assert pattern

Example:
```typescript
describe('StreamJSONParser', () => {
  describe('process', () => {
    it('should parse a complete JSON line', () => {
      // Arrange
      const parser = new StreamJSONParser();
      const message = { type: 'system' };

      // Act
      parser.process(JSON.stringify(message) + '\n');

      // Assert
      expect(parser.getStatus()).toBe('starting');
    });
  });
});
```

### Test Coverage

Aim for meaningful test coverage:
- Core business logic (DataStore, ProcessManager)
- Stream parsing (StreamJSONParser)
- State management (Zustand stores)
- IPC validators

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature main
   ```

2. **Make your changes** following the code style guidelines

3. **Write tests** for new functionality

4. **Run all checks**:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:run
   ```

5. **Commit your changes** using conventional commits

6. **Push your branch**:
   ```bash
   git push origin feature/my-feature
   ```

7. **Create a Pull Request** against `main`

### PR Checklist

- [ ] Code follows the project style guidelines
- [ ] Tests pass locally
- [ ] New functionality has tests
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with `main`

### Review Process

1. Automated CI checks must pass
2. At least one maintainer review is required
3. All review comments must be addressed
4. PR must be rebased on latest `main` before merge

## Questions?

If you have questions about contributing, please open an issue with the `question` label.

Thank you for contributing to Claude Code Orchestra!
