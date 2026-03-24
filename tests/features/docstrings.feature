Feature: Doc Strings
  Demonstrate doc string support with various content types

  Scenario: Create a blog post
    Given a blog post with content:
      """
      This is the body of the blog post.
      It can span multiple lines.
      """
    Then the post should be saved

  Scenario: JSON payload
    Given a JSON payload
      ```json
      {"name": "Alice", "role": "admin"}
      ```
    Then the payload should be valid

  Scenario: Backtick plain doc string
    Given a blog post with content:
      ```
      This uses backtick delimiters.
      Also multi-line.
      ```
    Then the post should be saved
