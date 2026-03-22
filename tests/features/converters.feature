Feature: Custom type converters
  Demonstrate inline converters via decorator kwargs and annotations

  Scenario: CSV list via decorator kwarg converter
    Given a csv list via kwarg: "apples, bananas, cherries"
    Then the kwarg list should have 3 items
    And the kwarg list should contain "bananas"

  Scenario: CSV list via annotation converter
    Given a csv list via annotation: "red, green, blue"
    Then the annotation list should have 3 items
    And the annotation list should contain "green"

  Scenario: Date via decorator kwarg converter
    Given a date via kwarg: "2024-03-15"
    Then the kwarg date year should be 2024
