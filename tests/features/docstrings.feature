Feature: Doc Strings
  Demonstrate doc string support

  Scenario: Create a blog post
    Given a blog post with content:
      """
      This is the body of the blog post.
      It can span multiple lines.
      """
    Then the post should be saved
