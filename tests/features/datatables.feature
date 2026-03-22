Feature: Data Tables
  Demonstrate data table support

  Scenario: Create multiple users
    Given the following users exist:
      | name  | email           | role  |
      | Alice | alice@test.com  | admin |
      | Bob   | bob@test.com    | user  |
    Then there should be 2 users in the system
