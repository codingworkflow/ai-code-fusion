# Testing Guidelines for AI Code Fusion (Updated)

## Core Principles

1. **Test Real Logic, Not Mocks**: Tests should execute the actual application logic whenever possible. Mocking core business logic defeats the purpose of testing.

2. **Mock Boundaries, Not Logic**: Only mock external dependencies (filesystem, network, etc.), never the business logic or decision-making code.

3. **Integration Tests for Integration Points**: When components interact, test their real integration without mocking the intermediary logic.

4. **Test at the Appropriate Level**: Match the test type to what's being tested - unit tests for focused functions, integration tests for component interactions.

## When to Use Mocks

### DO Mock:

- **External Dependencies**: File system (fs) operations, network requests, databases
- **Time-dependent Operations**: For predictable test execution
- **Side-effect Generating Code**: Email senders, loggers (when not the subject under test)
- **Expensive Operations**: When they would make tests impractically slow and aren't the focus of the test

### DO NOT Mock (But Provide Test Inputs):

- **Core Business Logic**: The pattern-matcher utility, filtering decision logic
- **The Subject Under Test**: The component or function being tested
- **Integration Points**: When testing how components work together

### Proper Mocking of Low-Level Functions:

- Instead of mocking high-level functions like `isBinaryFile`, mock the underlying dependencies (fs.openSync, fs.readSync) to provide controlled test data
- This tests the real function logic while controlling its inputs

## Testing Pattern Matching Logic

Pattern matching is at the core of our application. Testing it requires:

1. **Direct Unit Tests**: Test pattern-matcher functions directly with diverse inputs
2. **Edge Case Coverage**: Include complex patterns, edge cases, and special characters
3. **Real Execution**: Always execute the real pattern matching logic
4. **Integration Testing**: Test how file-analyzer uses pattern-matcher without mocking either
5. **Library Validation**: If using external libraries like micromatch, test our wrapper functions to ensure correct behavior

### Test Cases Must Include:

- **Directory Wildcards**: Test `**/` and `/**` patterns thoroughly
- **Nested Wildcards**: Test patterns like `**/*.js` that combine different wildcards
- **Path Separators**: Test with and without trailing slashes
- **Common Patterns**: Test with real-world patterns from .gitignore files

## Test Quality Guidelines

1. **Readability**: Tests should clearly show what's being tested and expected outcomes
2. **Isolation**: Tests should not have hidden dependencies on other tests
3. **Completeness**: Cover success paths, failure paths, and edge cases
4. **Arrange-Act-Assert**: Structure tests with clear setup, action, and verification
5. **Real-world Scenarios**: Tests should reflect actual usage patterns of the application

## Binary File Detection Testing

1. **Mock Low-level File Operations**: Mock fs.openSync, fs.readSync, fs.closeSync to return controlled binary/text content
2. **Test Against Real Implementation**: Don't mock the isBinaryFile function itself
3. **Cover Edge Cases**: Test empty files, files with control characters, mixed content

## Gitignore Parser Testing

1. **Mock Filesystem Only**: Only mock the fs calls returning gitignore content
2. **Verify Pattern Generation**: Test that patterns are correctly generated
3. **Test Caching**: Verify caching behavior with minimal mocking

## File Analyzer Testing

1. **Use Real Pattern Matcher**: Never mock the pattern-matcher utility
2. **Mock File Reading**: Mock fs.readFileSync for controlled input
3. **Verify Integration**: Test the integration with pattern-matcher using real logic
4. **Test Configuration Options**: Verify that each configuration option properly affects file inclusion/exclusion

## Main Process Integration Testing

1. **Targeted Mocking**: Only mock electron APIs, not the business logic
2. **E2E Workflows**: Test complete workflows where possible
3. **IPC Handler Testing**: Verify that IPC handlers correctly use the business logic

## Anti-Patterns to Avoid

1. ❌ **Mocking the Implementation**: Tests that reimplement business logic in mocks
2. ❌ **Over-mocking**: Mocking more than necessary, creating brittle tests
3. ❌ **Over-specificity**: Testing implementation details rather than behavior
4. ❌ **False Positives**: Tests that would pass even if the real code was broken
5. ❌ **Hard-coded Assumptions**: Tests that assume implementation details (like node_modules exclusion)
6. ❌ **Complex Test Logic**: Tests should be clear and maintainable
