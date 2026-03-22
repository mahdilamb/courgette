Feature: Regex step matching
  Demonstrate regex patterns in step definitions

  Scenario: Match email address
    Given a user with email "alice@example.com"
    Then the email domain should be "example.com"

  Scenario: Match multiple formats
    Given a temperature of 72.5°F
    Then the temperature in celsius should be about 22.5

  Scenario: Match with optional word
    Given I have 3 red apples
    And I have 5 green apples
    Then I should have 8 apples total
