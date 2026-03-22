import { describe, it, expect } from "vitest";
import { Uri } from "vscode";
import {
  extractStepText,
  parseDecoratorLine,
  parseStepDefinitions,
  patternMatches,
  patternMatchCaptures,
  findMatchingStep,
  findPatternOffset,
  STEP_LINE_RE,
  DECORATOR_RE,
  StepDef,
} from "./stepDefinitionProvider";

// ---------------------------------------------------------------------------
// extractStepText
// ---------------------------------------------------------------------------

describe("extractStepText", () => {
  it("extracts text from a Given step", () => {
    expect(extractStepText("    Given I have 5 items")).toBe("I have 5 items");
  });

  it("extracts text from a When step", () => {
    expect(extractStepText("    When I click submit")).toBe("I click submit");
  });

  it("extracts text from a Then step", () => {
    expect(extractStepText("    Then the result should be 8")).toBe(
      "the result should be 8"
    );
  });

  it("extracts text from And/But steps", () => {
    expect(extractStepText("    And I have 3 more")).toBe("I have 3 more");
    expect(extractStepText("    But not this one")).toBe("not this one");
  });

  it("extracts text from * steps", () => {
    expect(extractStepText("    * something")).toBe("something");
  });

  it("returns null for non-step lines", () => {
    expect(extractStepText("Feature: Hello")).toBeNull();
    expect(extractStepText("  Scenario: Test")).toBeNull();
    expect(extractStepText("  # a comment")).toBeNull();
    expect(extractStepText("")).toBeNull();
  });

  it("handles French keywords", () => {
    expect(extractStepText("    Soit j'ai le nombre 5")).toBe(
      "j'ai le nombre 5"
    );
    expect(extractStepText("    Quand j'additionne")).toBe("j'additionne");
    expect(extractStepText("    Alors le résultat est 8")).toBe(
      "le résultat est 8"
    );
  });

  it("handles German keywords", () => {
    expect(extractStepText("    Gegeben sei ein Benutzer")).toBe("ein Benutzer");
    expect(extractStepText("    Wenn ich klicke")).toBe("ich klicke");
    expect(extractStepText("    Dann sollte es funktionieren")).toBe(
      "sollte es funktionieren"
    );
  });

  it("handles Russian keywords", () => {
    expect(extractStepText("    Допустим я на странице")).toBe("я на странице");
    expect(extractStepText("    Когда я нажимаю")).toBe("я нажимаю");
    expect(extractStepText("    Тогда результат")).toBe("результат");
  });

  it("handles Japanese keywords", () => {
    expect(extractStepText("    前提 ユーザーがいる")).toBe("ユーザーがいる");
  });
});

// ---------------------------------------------------------------------------
// parseDecoratorLine
// ---------------------------------------------------------------------------

describe("parseDecoratorLine", () => {
  it("parses @given with double-quoted string", () => {
    const result = parseDecoratorLine('@given("I have {count:d} items")');
    expect(result).toMatchObject({ pattern: "I have {count:d} items", isRegex: false });
    expect(result!.column).toBe(8);
  });

  it("parses @when with single-quoted string", () => {
    const result = parseDecoratorLine("@when('I click submit')");
    expect(result).toMatchObject({ pattern: "I click submit", isRegex: false });
    expect(result!.column).toBe(7);
  });

  it("parses @then with raw string", () => {
    const result = parseDecoratorLine('@then(r"the result is {n:d}")');
    expect(result).toMatchObject({ pattern: "the result is {n:d}", isRegex: false });
  });

  it("parses @step decorator", () => {
    const result = parseDecoratorLine('@step("something happens")');
    expect(result).toMatchObject({ pattern: "something happens", isRegex: false });
  });

  it("parses re.compile pattern", () => {
    const result = parseDecoratorLine(
      '@given(re.compile(r"I have (\\d+) items"))'
    );
    expect(result).toMatchObject({ pattern: "I have (\\d+) items", isRegex: true });
  });

  it("parses re.compile with double quotes", () => {
    const result = parseDecoratorLine(
      '@when(re.compile("a user named (?P<name>\\w+)"))'
    );
    expect(result).toMatchObject({
      pattern: "a user named (?P<name>\\w+)",
      isRegex: true,
    });
  });

  it("handles indented decorators", () => {
    const result = parseDecoratorLine('    @given("something")');
    expect(result).toMatchObject({ pattern: "something", isRegex: false });
    expect(result!.column).toBe(12);
  });

  it("returns null for non-decorator lines", () => {
    expect(parseDecoratorLine("def my_function():")).toBeNull();
    expect(parseDecoratorLine("# @given('comment')")).toBeNull();
    expect(parseDecoratorLine("")).toBeNull();
    expect(parseDecoratorLine("@unknown('something')")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseStepDefinitions
// ---------------------------------------------------------------------------

describe("parseStepDefinitions", () => {
  it("extracts multiple definitions from Python source", () => {
    const source = `
from courgette import given, when, then

@given("I have {count:d} items")
def given_items(count: int):
    pass

@when("I click submit")
def when_click():
    pass

@then(re.compile(r"the result should be (\\d+)"))
def then_result():
    pass
`.trim();

    const uri = Uri.file("/test/steps.py");
    const defs = parseStepDefinitions(source, uri);

    expect(defs).toHaveLength(3);
    expect(defs[0]).toMatchObject({
      pattern: "I have {count:d} items",
      isRegex: false,
      line: 2,
    });
    expect(defs[1]).toMatchObject({
      pattern: "I click submit",
      isRegex: false,
      line: 6,
    });
    expect(defs[2]).toMatchObject({
      pattern: "the result should be (\\d+)",
      isRegex: true,
      line: 10,
    });
  });

  it("handles empty file", () => {
    const defs = parseStepDefinitions("", Uri.file("/empty.py"));
    expect(defs).toHaveLength(0);
  });

  it("handles file with no decorators", () => {
    const source = `
def helper():
    pass

class MyClass:
    pass
`.trim();
    const defs = parseStepDefinitions(source, Uri.file("/no_steps.py"));
    expect(defs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// patternMatches
// ---------------------------------------------------------------------------

describe("patternMatches", () => {
  describe("exact match", () => {
    it("matches identical text", () => {
      expect(patternMatches("I click submit", "I click submit", false)).toBe(
        true
      );
    });

    it("does not match different text", () => {
      expect(patternMatches("I click cancel", "I click submit", false)).toBe(
        false
      );
    });
  });

  describe("parse-style patterns", () => {
    it("matches {name} placeholder", () => {
      expect(
        patternMatches("I have a dog", "I have a {name}", false)
      ).toBe(true);
    });

    it("matches {count:d} integer placeholder", () => {
      expect(
        patternMatches("I have 5 items", "I have {count:d} items", false)
      ).toBe(true);
    });

    it("matches {price:f} float placeholder", () => {
      expect(
        patternMatches("costs 9.99 dollars", "costs {price:f} dollars", false)
      ).toBe(true);
    });

    it("matches multiple placeholders", () => {
      expect(
        patternMatches(
          "user Alice has 3 items",
          "user {name} has {count:d} items",
          false
        )
      ).toBe(true);
    });

    it("does not match when surrounding text differs", () => {
      expect(
        patternMatches("I lost 5 items", "I have {count:d} items", false)
      ).toBe(false);
    });
  });

  describe("regex patterns", () => {
    it("matches a simple regex", () => {
      expect(
        patternMatches("I have 5 items", "I have \\d+ items", true)
      ).toBe(true);
    });

    it("matches named groups", () => {
      expect(
        patternMatches(
          "user Alice",
          "user (?P<name>\\w+)",
          true
        )
      ).toBe(true);
    });

    it("does not match when regex doesn't match", () => {
      expect(
        patternMatches("I have many items", "I have \\d+ items", true)
      ).toBe(false);
    });

    it("handles invalid regex gracefully", () => {
      expect(patternMatches("anything", "[invalid(", true)).toBe(false);
    });
  });

  describe("special characters in patterns", () => {
    it("escapes dots in exact patterns", () => {
      expect(
        patternMatches("version 1.2.3", "version 1.2.3", false)
      ).toBe(true);
      expect(
        patternMatches("version 1x2x3", "version 1.2.3", false)
      ).toBe(false);
    });

    it("handles parentheses in patterns", () => {
      expect(
        patternMatches(
          'the value is "hello"',
          'the value is "{val}"',
          false
        )
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// findMatchingStep
// ---------------------------------------------------------------------------

describe("findMatchingStep", () => {
  const uri = Uri.file("/test/steps.py");

  const defs: StepDef[] = [
    { uri, line: 5, column: 8, pattern: "I click submit", isRegex: false },
    { uri, line: 10, column: 8, pattern: "I have {count:d} items", isRegex: false },
    { uri, line: 15, column: 8, pattern: "a user named (?P<name>\\w+)", isRegex: true },
  ];

  it("finds exact match", () => {
    const result = findMatchingStep("I click submit", defs);
    expect(result).toBeDefined();
    expect(result!.line).toBe(5);
  });

  it("finds parse-style match", () => {
    const result = findMatchingStep("I have 42 items", defs);
    expect(result).toBeDefined();
    expect(result!.line).toBe(10);
  });

  it("finds regex match", () => {
    const result = findMatchingStep("a user named Alice", defs);
    expect(result).toBeDefined();
    expect(result!.line).toBe(15);
  });

  it("returns undefined for no match", () => {
    const result = findMatchingStep("something completely different", defs);
    expect(result).toBeUndefined();
  });

  it("returns the first match when multiple patterns match", () => {
    const overlapping: StepDef[] = [
      { uri, line: 1, column: 8, pattern: "I have {n} things", isRegex: false },
      { uri, line: 2, column: 8, pattern: "I have .*", isRegex: true },
    ];
    const result = findMatchingStep("I have many things", overlapping);
    expect(result).toBeDefined();
    expect(result!.line).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// STEP_LINE_RE edge cases
// ---------------------------------------------------------------------------

describe("STEP_LINE_RE", () => {
  it("matches steps with leading whitespace", () => {
    expect(STEP_LINE_RE.test("      Given something")).toBe(true);
  });

  it("does not match Feature/Scenario keywords", () => {
    expect(STEP_LINE_RE.test("Feature: Hello")).toBe(false);
    expect(STEP_LINE_RE.test("Scenario: Test")).toBe(false);
  });

  it("requires a space after the keyword", () => {
    expect(STEP_LINE_RE.test("Givenno_space")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DECORATOR_RE edge cases
// ---------------------------------------------------------------------------

describe("DECORATOR_RE", () => {
  it("matches raw strings with r prefix", () => {
    expect(DECORATOR_RE.test("@given(r'pattern')")).toBe(true);
    expect(DECORATOR_RE.test('@when(r"pattern")')).toBe(true);
  });

  it("matches re.compile with r prefix", () => {
    expect(DECORATOR_RE.test("@then(re.compile(r'pattern'))")).toBe(true);
  });

  it("does not match unknown decorators", () => {
    expect(DECORATOR_RE.test("@fixture('something')")).toBe(false);
    expect(DECORATOR_RE.test("@pytest.mark.skip")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// patternMatchCaptures
// ---------------------------------------------------------------------------

describe("patternMatchCaptures", () => {
  describe("parse-style patterns", () => {
    it("captures a single placeholder", () => {
      const caps = patternMatchCaptures("I have 5 items", "I have {count:d} items", false);
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(1);
      expect(caps![0]).toMatchObject({ value: "5", name: "count" });
      expect(caps![0].start).toBe(7);
      expect(caps![0].end).toBe(8);
    });

    it("captures multiple placeholders", () => {
      const caps = patternMatchCaptures(
        "user Alice has 3 items",
        "user {name} has {count:d} items",
        false
      );
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(2);
      expect(caps![0]).toMatchObject({ value: "Alice", name: "name" });
      expect(caps![1]).toMatchObject({ value: "3", name: "count" });
    });

    it("captures a quoted string placeholder", () => {
      const caps = patternMatchCaptures(
        'I add user "Bob"',
        'I add user "{name}"',
        false
      );
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(1);
      expect(caps![0]).toMatchObject({ value: "Bob", name: "name" });
    });

    it("returns empty array for exact match (no placeholders)", () => {
      const caps = patternMatchCaptures("I click submit", "I click submit", false);
      expect(caps).toEqual([]);
    });

    it("returns null for no match", () => {
      const caps = patternMatchCaptures("I click cancel", "I click submit", false);
      expect(caps).toBeNull();
    });
  });

  describe("regex patterns", () => {
    it("captures named groups", () => {
      const caps = patternMatchCaptures(
        "a user named Alice",
        "a user named (?P<name>\\w+)",
        true
      );
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(1);
      expect(caps![0]).toMatchObject({ value: "Alice", name: "name" });
    });

    it("captures positional groups", () => {
      const caps = patternMatchCaptures(
        "I have 42 items",
        "I have (\\d+) items",
        true
      );
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(1);
      expect(caps![0]).toMatchObject({ value: "42", name: null });
    });

    it("captures multiple named groups", () => {
      const caps = patternMatchCaptures(
        "user alice@test.com is admin",
        "user (?P<email>\\S+@\\S+) is (?P<role>\\w+)",
        true
      );
      expect(caps).not.toBeNull();
      expect(caps).toHaveLength(2);
      expect(caps![0]).toMatchObject({ value: "alice@test.com", name: "email" });
      expect(caps![1]).toMatchObject({ value: "admin", name: "role" });
    });

    it("returns null for no match", () => {
      const caps = patternMatchCaptures("nothing here", "I have (\\d+)", true);
      expect(caps).toBeNull();
    });

    it("handles invalid regex gracefully", () => {
      const caps = patternMatchCaptures("anything", "[invalid(", true);
      expect(caps).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// findPatternOffset
// ---------------------------------------------------------------------------

describe("findPatternOffset", () => {
  describe("parse-style patterns", () => {
    it("cursor on placeholder value maps to {placeholder} in pattern", () => {
      // "I eat 5 cucumbers" cursor on "5" (offset 6)
      // pattern "I eat {eat:d} cucumbers" — {eat:d} starts at offset 6
      const offset = findPatternOffset(
        "I eat 5 cucumbers",
        6,
        "I eat {eat:d} cucumbers",
        false
      );
      expect(offset).toBe(6);
    });

    it("cursor on literal text maps to same position in pattern", () => {
      // "I eat 5 cucumbers" cursor on "c" in "cucumbers" (offset 8)
      // pattern "I eat {eat:d} cucumbers" — "cucumbers" starts at offset 14
      const offset = findPatternOffset(
        "I eat 5 cucumbers",
        8,
        "I eat {eat:d} cucumbers",
        false
      );
      expect(offset).toBe(14);
    });

    it("cursor on first placeholder of multiple", () => {
      // "user Alice has 3 items" cursor on "Alice" (offset 5)
      // pattern "user {name} has {count:d} items" — {name} at offset 5
      const offset = findPatternOffset(
        "user Alice has 3 items",
        5,
        "user {name} has {count:d} items",
        false
      );
      expect(offset).toBe(5);
    });

    it("cursor on second placeholder of multiple", () => {
      // "user Alice has 3 items" cursor on "3" (offset 15)
      // pattern "user {name} has {count:d} items" — {count:d} at offset 16
      const offset = findPatternOffset(
        "user Alice has 3 items",
        15,
        "user {name} has {count:d} items",
        false
      );
      expect(offset).toBe(16);
    });

    it("maps directly for exact match pattern (no placeholders)", () => {
      // Exact match: cursor at position 5 in text = position 5 in pattern
      const offset = findPatternOffset(
        "I click submit",
        5,
        "I click submit",
        false
      );
      expect(offset).toBe(5);
    });
  });

  describe("regex patterns", () => {
    it("cursor on named group value maps to group in pattern", () => {
      // "a user named Alice" cursor on "Alice" (offset 13)
      // pattern "a user named (?P<name>\w+)" — (?P<name> at offset 13
      const offset = findPatternOffset(
        "a user named Alice",
        13,
        "a user named (?P<name>\\w+)",
        true
      );
      expect(offset).toBe(13);
    });

    it("cursor on year in date maps to (?P<year> group", () => {
      // "today is 2024-03-15" cursor on "2024" (offset 9)
      // pattern has (?P<year>\d{4}) starting at offset 9
      const offset = findPatternOffset(
        "today is 2024-03-15",
        9,
        "today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})",
        true
      );
      expect(offset).toBe(9); // (?P<year> starts at 9
    });

    it("cursor on month in date maps to (?P<month> group", () => {
      // "today is 2024-03-15" cursor on "03" (offset 14)
      const offset = findPatternOffset(
        "today is 2024-03-15",
        14,
        "today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})",
        true
      );
      expect(offset).toBe(25); // (?P<month> starts at 25
    });

    it("cursor on day in date maps to (?P<day> group", () => {
      // "today is 2024-03-15" cursor on "15" (offset 17)
      const offset = findPatternOffset(
        "today is 2024-03-15",
        17,
        "today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})",
        true
      );
      expect(offset).toBe(42); // (?P<day> starts at 42
    });

    it("cursor on literal dash between groups stays at pattern equivalent", () => {
      // "today is 2024-03-15" cursor on first "-" (offset 13)
      // This is between year and month groups — not in any capture
      const offset = findPatternOffset(
        "today is 2024-03-15",
        13,
        "today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})",
        true
      );
      // Should return 0 (default) since it's not in any capture
      expect(offset).toBe(0);
    });

    it("cursor on email in quoted regex group", () => {
      // 'a user with email "alice@example.com"' cursor on "alice" (offset 19)
      // pattern 'a user with email "(?P<email>[^"]+)"' — (?P<email> at 19
      const offset = findPatternOffset(
        'a user with email "alice@example.com"',
        19,
        'a user with email "(?P<email>[^"]+)"',
        true
      );
      expect(offset).toBe(19);
    });

    it("full pipeline: parse decorator → find offset for month in date regex", () => {
      // This is the actual line from step_custom_types.py
      const line = '@given(re.compile(r"today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})"))';
      const parsed = parseDecoratorLine(line);
      expect(parsed).not.toBeNull();
      expect(parsed!.isRegex).toBe(true);
      expect(parsed!.pattern).toBe("today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})");

      // Verify column points to start of pattern inside the quotes
      const patternStart = parsed!.column;
      expect(line[patternStart]).toBe("t"); // "today..."

      // Step text: "today is 2024-03-15"
      // Clicking on "03" → cursorOffset=14 within step text
      const stepText = "today is 2024-03-15";
      const offset = findPatternOffset(stepText, 14, parsed!.pattern, true);

      // Should land on (?P<month> in the pattern
      const landing = parsed!.pattern.indexOf("(?P<month>");
      expect(offset).toBe(landing);

      // The full column in the file = patternStart + offset
      const fileColumn = patternStart + offset;
      // Verify it points to "(" of (?P<month>
      expect(line[fileColumn]).toBe("(");
    });

    it("cursor on positional regex group", () => {
      // "I have 42 items" cursor on "42" (offset 7)
      // pattern "I have (\d+) items" — ( at offset 7
      const offset = findPatternOffset(
        "I have 42 items",
        7,
        "I have (\\d+) items",
        true
      );
      expect(offset).toBe(7);
    });
  });
});
