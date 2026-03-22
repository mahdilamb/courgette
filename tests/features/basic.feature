Feature: Basic arithmetic
  As a calculator user
  I want to perform basic arithmetic
  So that I can verify calculations

  Scenario: Addition
    Given I have the number 5
    And I have the number 3
    When I add them together
    Then the result should be 8

  Scenario: Subtraction
    Given I have the number 10
    And I have the number 4
    When I subtract the second from the first
    Then the result should be 6
