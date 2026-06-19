```markdown
# my-skills Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill documents the core development patterns and conventions used in the `my-skills` TypeScript repository. It covers file organization, code style, commit message conventions, and testing patterns to ensure consistency and maintainability across the codebase.

## Coding Conventions

### File Naming
- All files use **kebab-case**.
- Example:  
  ```
  user-profile.ts
  data-utils.test.ts
  ```

### Import Style
- Use **relative imports** for all modules.
- Example:
  ```typescript
  import { fetchData } from './data-utils';
  ```

### Export Style
- Use **named exports** exclusively.
- Example:
  ```typescript
  // In data-utils.ts
  export function fetchData() { ... }
  ```

### Commit Messages
- Follow **conventional commits** with the `feat` prefix for new features.
- Example:
  ```
  feat: add user authentication module
  ```

## Workflows

### Feature Development
**Trigger:** When implementing a new feature  
**Command:** `/feature-development`

1. Create a new TypeScript file using kebab-case.
2. Write your feature using named exports.
3. Use relative imports for dependencies.
4. Add or update corresponding test files (`*.test.ts`).
5. Commit your changes using the `feat` prefix and a concise description.
   - Example: `feat: implement user login logic`

### Testing
**Trigger:** When adding or updating code  
**Command:** `/run-tests`

1. Write or update test files alongside your implementation, using the `*.test.ts` pattern.
2. Run the test suite using your preferred TypeScript-compatible test runner.
3. Ensure all tests pass before committing.

## Testing Patterns

- Test files are named with the `*.test.ts` pattern and placed alongside the code they test.
- Testing framework is not specified; use a TypeScript-compatible runner (e.g., Jest, Mocha).
- Example test file:
  ```typescript
  // data-utils.test.ts
  import { fetchData } from './data-utils';

  describe('fetchData', () => {
    it('should return expected data', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| /feature-development | Start a new feature with repo conventions |
| /run-tests           | Run all test files in the project         |
```