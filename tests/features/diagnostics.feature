Feature: Diagnostic error messages
  Verify that courgette produces helpful errors when things go wrong

  Scenario: Missing context key with no prior Given
    Given a step that accesses context key "result" with no setup
    Then the error message should contain "context['result']"
    And the error message should contain "never set"
    And the error message should contain "Context is empty"

  Scenario: Missing context key shows available keys
    Given a context with key "count" set to 5
    And a step that accesses context key "result"
    Then the error message should contain "context['result']"
    And the error message should contain "Available context keys: count"

  Scenario: Typo in context key suggests similar keys
    Given a context with key "result" set to 42
    And a step that accesses context key "reslt"
    Then the error message should contain "context['reslt']"
    And the error message should contain "Similar keys: result"

  Scenario: Missing context key shows prior step trace
    Given a context with key "user" set to "Alice"
    And a context with key "role" set to "admin"
    And a step that accesses context key "confirmation_code"
    Then the error message should contain "Steps that ran before"

  Scenario: Undefined step shows did you mean
    Given a registry with pattern "I have {count:d} items"
    When I look up the step "I hve 5 items"
    Then the error message should contain "Undefined step"
    And the error message should contain "Did you mean"
    And the error message should contain "I have {count:d} items"

  Scenario: Assertion error shows step location
    Given a step that asserts 1 equals 2
    Then the error message should contain "assert"
    And the error type should be "StepAssertionError"

  Scenario: Fail fast skips remaining steps
    Given a scenario with steps: fail, skip_me, skip_too
    And the first step raises an error
    When I run the scenario
    Then step "fail" should have status "failed"
    And step "skip_me" should have status "skipped"
    And step "skip_too" should have status "skipped"
