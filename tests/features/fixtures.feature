@fixtures
Feature: Pytest fixture sharing
  Demonstrate that pytest fixtures are shared between hooks and steps

  Scenario: Fixture injected into step
    Given I log "setup complete" via the shared logger
    And I log "step says hello" via the shared logger
    Then the shared logger should have 3 entries
    And the log should contain "before_scenario"
    And the log should contain "step says hello"

  Scenario: Fixture state resets per scenario
    Given I log "second scenario" via the shared logger
    Then the shared logger should have 2 entries
