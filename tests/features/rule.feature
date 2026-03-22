Feature: Rules example
  Demonstrate the Rule keyword

  Rule: Users must be authenticated
    Scenario: Authenticated user can view dashboard
      Given I am logged in
      When I visit the dashboard
      Then I should see the dashboard

    Scenario: Anonymous user is redirected
      Given I am not logged in
      When I visit the dashboard
      Then I should be redirected to login

  Rule: Admins have extra permissions
    Scenario: Admin can delete users
      Given I am logged in as admin
      When I delete a user
      Then the user should be removed
