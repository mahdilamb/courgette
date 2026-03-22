Feature: Custom type conversions
  Demonstrate using custom type parsers and converters

  Scenario: Parse a date
    Given today is 2024-03-15
    Then the year should be 2024
    And the month should be 3

  Scenario: Parse a list of items
    Given a shopping list: "oat milk, tofu, bread, edamame"
    Then the list should have 4 items
    And "tofu" should be in the list

  Scenario: Parse boolean values
    Given the feature flag "dark_mode" is enabled
    And the feature flag "legacy_ui" is disabled
    Then "dark_mode" should be true
    And "legacy_ui" should be false

  Scenario: Parse a JSON payload
    Given the following JSON config:
      ```json
      {"debug": true, "log_level": "info", "max_retries": 3}
      ```
    Then the config key "debug" should be true
    And the config key "max_retries" should be 3
