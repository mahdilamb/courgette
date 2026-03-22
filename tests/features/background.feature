Feature: Background example
  Show how background steps work

  Background:
    Given a clean database

  Scenario: Add a user
    When I add user "Alice"
    Then the database should have 1 user

  Scenario: Add two users
    When I add user "Alice"
    And I add user "Bob"
    Then the database should have 2 users
