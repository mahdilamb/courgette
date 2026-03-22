Feature: Scenario Outline example
  Demonstrate data-driven testing

  Scenario Outline: Eating cucumbers
    Given there are <start> cucumbers
    When I eat <eat> cucumbers
    Then I should have <left> cucumbers

    Examples: Some amounts
      | start | eat | left |
      |    12 |   5 |    7 |
      |    20 |   5 |   15 |
      |     0 |   0 |    0 |
