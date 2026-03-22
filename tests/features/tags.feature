@api
Feature: Tagged scenarios
  Demonstrate tag filtering

  @smoke
  Scenario: Quick health check
    Given the API is running
    Then the health endpoint returns 200

  @slow @integration
  Scenario: Full integration test
    Given the API is running
    And the database is seeded
    When I run the full test suite
    Then all integration tests pass
