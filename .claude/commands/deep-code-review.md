---
description: Perform deep code review for Python and TypeScript codebases focusing on architecture, design, code quality, and best practices.
handoffs:
  - label: Review Architecture & Design
    agent: general-purpose
    prompt: Review the architecture and design patterns in this codebase. Focus on Python and TypeScript best practices, interface design, extensibility, and clean architecture principles.
  - label: Review Code Quality
    agent: general-purpose
    prompt: Review code quality focusing on DRY, YAGNI, SOLID principles, function length, parameter count, complexity, and adherence to KISS principle.
  - label: Review Builder Pattern Usage
    agent: general-purpose
    prompt: Analyze the implementation and usage of Builder patterns in Python and TypeScript code. Evaluate if they're appropriate and correctly implemented.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Overview

The text the user typed after `/deep-code-review` in the triggering message **is** the target for code review. This can be:
- A specific file path (e.g., `src/utils/auth.ts`)
- A directory path (e.g., `src/components/`)
- A glob pattern (e.g., `**/*.py`)
- Empty (review entire codebase)

Assume you always have it available in this conversation even if `$ARGUMENTS` appears literally below. Do not ask the user to repeat it unless they provided an empty command and you need clarification on what to review.

## Execution Flow

Given the target for code review (file, directory, pattern, or entire codebase), follow this process:

### Phase 1: Discovery & Analysis

1. **Parse Review Target**
   - If `$ARGUMENTS` is empty: Ask user what to review (specific file, directory, or entire codebase)
   - If `$ARGUMENTS` contains a path: Validate the path exists
   - If path doesn't exist: ERROR "Invalid path provided: [path]"

2. **Analyze Codebase Structure**
   - Use Glob tool to find all Python (`.py`) and TypeScript (`.ts`, `.tsx`) files in the review target
   - Use Grep tool to identify:
     - Module/class definitions
     - Function/method definitions
     - Import statements and dependencies
     - Configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`)
   - Document the structure and create a file manifest

3. **Extract Code Metrics**
   For each file in the review target, gather:
   - Total lines of code
   - Number of functions/methods
   - Number of classes/modules
   - Import statements and dependencies
   - Type annotations (for TypeScript)

### Phase 2: Architecture & Design Review

4. **Architecture Assessment**

   Create a file at `reviews/ARCHITECTURE_REVIEW.md` with the following analysis:

   ```markdown
   # Architecture & Design Review

   **Review Date**: [CURRENT_DATE]
   **Review Target**: [FILE/PATH]
   **Reviewer**: Claude Code

   ## High-Level Architecture

   ### System Overview
   - [ ] Clear separation of concerns
   - [ ] Appropriate layering (presentation, business logic, data access)
   - [ ] Consistent architectural patterns across codebase
   - [ ] Module organization follows domain boundaries

   ### Interface Design

   #### Python
   - [ ] Clear API design with explicit interfaces (ABC, Protocol)
   - [ ] Type hints used consistently (PEP 484/585)
   - [ ] Dependency inversion principle applied
   - [ ] Interfaces are segregated appropriately (ISP)
   - [ ] No tight coupling between modules

   #### TypeScript
   - [ ] Clear interface and type definitions
   - [ ] Proper use of abstract classes and interfaces
   - [ ] Dependency injection pattern applied
   - [ ] Modular exports (avoid default exports when possible)
   - [ ] Clear contract between modules

   ### Extensibility Analysis

   - [ ] Open/Closed Principle: Code open for extension, closed for modification
   - [ ] Plugin architecture considered where appropriate
   - [ ] Strategy pattern for interchangeable behaviors
   - [ ] Template method for customizable algorithms
   - [ ] Observer pattern for event-driven extensions

   ### Design Patterns

   - [ ] Appropriate use of design patterns
   - [ ] Patterns implemented correctly following language idioms
   - [ ] No over-engineering (YAGNI principle)

   ### Findings

   **Strengths**:
   - [List positive architectural decisions]

   **Concerns**:
   - [List architectural issues or code smells]

   **Recommendations**:
   - [Provide actionable architectural improvements]
   ```

5. **Scalability & Maintainability**
   - Evaluate if architecture supports scaling:
     - Horizontal scaling considerations
     - State management approach
     - Database design (if applicable)
     - Caching strategies
   - Evaluate maintainability:
     - Cyclic dependencies
     - Module coupling
     - Testability of components

### Phase 3: Code Quality Review

6. **Generate Code Quality Metrics**

   For Python and TypeScript files, analyze:

   - **Function/Method Length**: Flag functions > 150 lines
   - **Parameter Count**: Flag functions with > 7 parameters
   - **Cyclomatic Complexity**: Calculate complexity score
   - **Duplicate Code**: Identify repeated code blocks
   - **Code Coverage**: Check test coverage if tests exist

7. **KISS Principle Analysis**

   Create checklist for simplicity:

   - [ ] No unnecessary abstraction layers
   - [ ] Clear and straightforward logic flow
   - [ ] Minimal nesting (avoid > 3 levels)
   - [ ] Early returns reduce complexity
   - [ ] Guard clauses used appropriately
   - [ ] Functions do one thing (Single Responsibility)
   - [ ] No premature optimization

   Document violations with specific file:line references

8. **DRY Principle Validation**

   Use Grep tool to identify:
   - Repeated code blocks (similar patterns)
   - Copy-paste code
   - Common logic that could be extracted
   - Repeated magic numbers/strings

   Generate report of duplication issues

9. **SOLID Principles Review**

   For each class/module, evaluate:

   **S - Single Responsibility**
   - [ ] Each class/module has one reason to change
   - [ ] Class size is reasonable (< 300 lines)
   - [ ] Methods are cohesive

   **O - Open/Closed**
   - [ ] Extension through inheritance/composition
   - [ ] No modification of existing code for new features

   **L - Liskov Substitution**
   - [ ] Subtypes can replace base types without issues
   - [ ] Inheritance hierarchies are logical

   **I - Interface Segregation**
   - [ ] Interfaces are focused and small
   - [ ] No "fat" interfaces

   **D - Dependency Inversion**
   - [ ] Dependencies on abstractions, not concretions
   - [ ] Dependency injection or inversion of control

10. **YAGNI Principle Validation**

    Identify:
    - Unused code (dead code)
    - Unnecessary abstraction layers
    - Overly generic solutions for specific problems
    - Features not requested or used
    - Comments describing "future" functionality

### Phase 4: Builder Pattern Deep Dive

11. **Builder Pattern Review**

    Search for Builder pattern implementations:

    **In Python**:
    - Fluent interface with method chaining
    - `__init__` with many parameters
    - `@property` methods for configuration
    - Separate Builder class

    **In TypeScript**:
    - Interface/Class with chained methods
    - Private constructor with static builder
    - Generic builder implementations
    - Type-safe builder pattern

    For each Builder found or that should exist:

    ```markdown
    ## Builder Pattern Analysis: [FILE_NAME]

    **Location**: [file:line]

    ### Implementation Quality
    - [ ] Builder pattern is appropriate for this use case
    - [ ] Builder provides clear, fluent API
    - [ ] Builder enforces construction constraints
    - [ ] Builder validates configuration before building
    - [ ] Optional parameters handled correctly
    - [ ] Immutable result object (if appropriate)

    ### Python-Specific
    - [ ] Type hints on builder methods
    - [ ] Uses `@dataclass` or `__slots__` appropriately
    - [ ] Supports both builder and direct construction

    ### TypeScript-Specific
    - [ ] Type safety maintained throughout build process
    - [ ] Builder methods return correct `this` type
    - [ ] Generic constraints used appropriately

    ### Recommendations
    [Specific improvements for this Builder]
    ```

### Phase 5: Code Review Report Generation

12. **Generate Comprehensive Review Report**

    Create a file at `reviews/CODE_REVIEW_REPORT.md`:

    ```markdown
    # Code Review Report

    **Review Date**: [CURRENT_DATE]
    **Target**: [FILE/PATH]
    **Reviewer**: Claude Code
    **Total Files Reviewed**: [NUMBER]

    ## Executive Summary

    [Brief overview of findings and key recommendations]

    ## Metrics Summary

    | Metric | Value | Status |
    |--------|-------|--------|
    | Total Files | [COUNT] | - |
    | Python Files | [COUNT] | - |
    | TypeScript Files | [COUNT] | - |
    | Functions > 150 lines | [COUNT] | ⚠️ |
    | Functions > 7 parameters | [COUNT] | ⚠️ |
    | Average Complexity | [SCORE] | [PASS/FAIL] |
    | DRY Violations | [COUNT] | ⚠️ |
    | YAGNI Issues | [COUNT] | ⚠️ |
    | SOLID Violations | [COUNT] | ⚠️ |
    | Architecture Concerns | [COUNT] | ⚠️ |

    ## Critical Issues

    [List critical issues that must be addressed]

    ## Architecture Findings

    [Summary with link to ARCHITECTURE_REVIEW.md]

    ## Code Quality Findings

    ### KISS Principle
    - [List of violations with file:line]

    ### Function Length Violations (>150 lines)
    - [List with file:line]

    ### Parameter Count Violations (>7 params)
    - [List with file:line]

    ### DRY Violations
    - [List duplicated code blocks]

    ### SOLID Principle Violations
    - **Single Responsibility**: [List]
    - **Open/Closed**: [List]
    - **Liskov Substitution**: [List]
    - **Interface Segregation**: [List]
    - **Dependency Inversion**: [List]

    ### YAGNI Issues
    - [List unnecessary code/features]

    ### Builder Pattern Analyses
    - [Link to individual builder analyses]

    ## Recommendations (Prioritized)

    ### High Priority
    1. [Item]
    2. [Item]

    ### Medium Priority
    1. [Item]
    2. [Item]

    ### Low Priority
    1. [Item]
    2. [Item]

    ## Next Steps

    1. Address critical issues
    2. Review architecture recommendations
    3. Create refactoring tasks
    4. Re-run review after fixes
    ```

13. **Create File-Level Review Comments**

    For each file with issues, create a detailed review:

    ```markdown
    ## File: [PATH]

    **Total Lines**: [COUNT]
    **Functions**: [COUNT]
    **Classes**: [COUNT]
    **Issues Found**: [COUNT]

    ### Line-by-Line Review

    | Line | Issue Type | Severity | Description |
    |------|-----------|----------|-------------|
    | 45 | Function Length | HIGH | Function has 187 lines (limit: 150) |
    | 67 | Parameters | MEDIUM | Function has 9 parameters (limit: 7) |
    | 89-92 | DRY | MEDIUM | Duplicate logic found in line [OTHER] |
    | 102 | SOLID | HIGH | Multiple responsibilities in class |

    ### Suggested Fixes

    **Line 45-67** (Function too long):
    ```python | typescript
    # Before:
    def complex_function(param1, param2, param3, param4, param5, param6, param7, param8, param9):
        # 187 lines of code
        ...

    # After:
    def refactored_function(param1, param2, param3, param4, param5, param6, param7):
        # Extract helper functions
        result1 = helper1(param1, param2, param3)
        result2 = helper2(param4, param5, param6)
        return final_computation(result1, result2, param7)
    ```

    *[Additional suggestions for other issues]*
    ```

### Phase 6: Validation & Recommendations

14. **Verify Review Completeness**

    Cross-check that:
    - All Python files matched by pattern were reviewed
    - All TypeScript files matched by pattern were reviewed
    - All review checklists were completed
    - File manifest is accurate
    - Metrics calculations are reasonable

15. **Generate Refactoring Tasks**

    Create a task list at `reviews/REFACTORING_TASKS.md`:

    ```markdown
    # Refactoring Tasks

    **Generated From**: Code Review on [DATE]
    **Priority Order**: Critical → High → Medium → Low

    ## Critical (Must Fix)

    - [ ] Fix function exceeding 150 lines: [file:line]
    - [ ] Address SOLID violation: [file:line]

    ## High Priority

    - [ ] Extract duplicate code: [files]
    - [ ] Reduce parameter count: [file:line]
    - [ ] Simplify complex logic: [file:line]

    ## Medium Priority

    - [ ] Apply Builder pattern: [file:line]
    - [ ] Remove unused code: [file:lines]
    - [ ] Improve interface segregation: [file:line]

    ## Low Priority

    - [ ] Refactor for better naming: [files]
    - [ ] Add type annotations: [files]
    - [ ] Documentation improvements
    ```

### Phase 7: Final Report & Handoff

16. **Compile Final Deliverables**

    Ensure all review artifacts exist:
    - `reviews/CODE_REVIEW_REPORT.md` (main report)
    - `reviews/ARCHITECTURE_REVIEW.md` (architecture analysis)
    - `reviews/[FILE]_REVIEW.md` (file-level reviews)
    - `reviews/REFACTORING_TASKS.md` (actionable tasks)

17. **Generate Summary for User**

    Present a concise summary including:
    - Number of files reviewed
    - Critical issues count
    - Overall code quality rating (Excellent/Good/Fair/Poor)
    - Top 3 recommendations
    - Link to detailed reports

18. **Provide Next Steps**

    Options for user:
    - `/speckit.plan` - Create plan to address findings
    - Review specific files in more detail
    - Generate additional analysis on specific issues
    - Create tasks for refactoring

## Guidelines

### Python Best Practices Checklist

- [ ] Follow PEP 8 style guide
- [ ] Use type hints (PEP 484)
- [ ] Prefer composition over inheritance
- [ ] Use dataclasses for data containers
- [ ] Leverage context managers for resources
- [ ] Handle exceptions specifically (not bare except)
- [ ] Use generators for memory efficiency
- [ ] Follow "import this" Zen of Python
- [ ] Prefer immutable data structures where appropriate
- [ ] Use property decorators instead of getters/setters

### TypeScript Best Practices Checklist

- [ ] Enable strict mode in tsconfig.json
- [ ] Use interface over type when possible
- [ ] Prefer readonly for immutable data
- [ ] Use discriminated unions for state management
- [ ] Leverage generics appropriately
- [ ] Avoid 'any' type
- [ ] Use optional chaining and nullish coalescing
- [ ] Prefer functional programming patterns
- [ ] Use proper access modifiers (private, protected, public)
- [ ] Follow naming conventions (PascalCase for types, camelCase for variables)

### Code Quality Thresholds

Define clear thresholds:
- **Function Length**: 150 lines maximum
- **Parameter Count**: 7 parameters maximum
- **Cyclomatic Complexity**: 10 or less (good), 20+ (needs refactoring)
- **Class Length**: 300 lines maximum
- **File Length**: 500 lines maximum (prefer smaller focused files)
- **Inheritance Depth**: Maximum 3 levels
- **Method Count per Class**: Maximum 20 methods

### Review Severity Levels

- **CRITICAL**: Must fix - bugs, security issues, blocking problems
- **HIGH**: Should fix soon - significant code smells, architecture issues
- **MEDIUM**: Fix when convenient - minor code quality issues
- **LOW**: Nice to fix - style, naming, minor improvements

### Approach

1. **Be specific**: Always reference file:line numbers
2. **Provide examples**: Show before/after code snippets
3. **Explain why**: Justify recommendations with principles
4. **Prioritize**: Focus on high-impact issues first
5. **Be constructive**: Aim to improve, not criticize
6. **Consider context**: Understand the problem domain before judging
7. **Balance theory and practice**: Apply principles pragmatically

## Error Handling

If unable to complete review:
- Missing files: Report specific paths that couldn't be found
- Permission issues: Note which files couldn't be accessed
- Large codebases: Process in batches and report partial results
- Unsupported languages: Limit scope to Python/TypeScript only

## Deliverables

At minimum, provide:
1. Code quality metrics summary
2. List of critical and high-priority issues
3. Architecture assessment
4. Top 5 actionable recommendations
5. Link to detailed reports

For comprehensive reviews, also provide:
6. Full file-by-file analysis
7. SOLID principle evaluation
8. DRY/YAGNI violations report
9. Builder pattern analysis
10. Refactoring task list
