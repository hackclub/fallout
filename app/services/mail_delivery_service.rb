class MailDeliveryService
  def self.ship_status_changed(ship)
    case ship.status
    when "approved"
      MailMessage.create!(
        summary: "Your ship for #{ship.project.name} was approved!",
        content: ship.feedback.present? ? "Feedback: #{ship.feedback}" : nil,
        user: ship.user,
        source: ship,
        action_url: "/projects/#{ship.project_id}"
      )
    when "returned"
      MailMessage.create!(
        summary: "Your ship for #{ship.project.name} was returned",
        content: "Your submission needs changes.#{" Feedback: #{ship.feedback}" if ship.feedback.present?}",
        user: ship.user,
        source: ship,
        action_url: "/projects/#{ship.project_id}"
      )
    when "rejected"
      MailMessage.create!(
        summary: "Your ship for #{ship.project.name} was not accepted",
        content: ship.feedback.present? ? "Feedback: #{ship.feedback}" : nil,
        user: ship.user,
        source: ship
      )
    end
  end

  def self.collaboration_invite_sent(invite)
    MailMessage.create!(
      summary: "#{invite.inviter.display_name} invited you to collaborate on #{invite.project.name}",
      user: invite.invitee,
      source: invite,
      action_url: "/collaboration_invites/#{invite.id}",
      dismissable: false # User must accept or decline — cannot silently dismiss
    )
  end

  def self.streak_milestone(user, streak_length)
    MailMessage.create!(
      summary: ":yay: #{streak_length}-day streak! You're on fire!",
      user: user,
      action_url: "/streak_goal"
    )
  end

  def self.streak_reminder(user, current_streak)
    MailMessage.create!(
      summary: "Don't lose your #{current_streak}-day streak! Post a journal entry today.",
      user: user,
      action_url: "/journal_entries/new",
      expires_at: 1.day.from_now
    )
  end

  def self.streak_freeze_used(user, remaining)
    MailMessage.create!(
      summary: "A streak freeze was used for you. #{remaining} freeze#{remaining == 1 ? '' : 's'} left.",
      user: user,
      action_url: "/streak_goal"
    )
  end

  def self.streak_broken(user, streak_length)
    MailMessage.create!(
      summary: "Your #{streak_length}-day streak ended. Start a new one today!",
      user: user,
      action_url: "/journal_entries/new"
    )
  end

  def self.streak_goal_broken(user, target_days)
    MailMessage.create!(
      summary: "Your #{target_days}-day streak goal ended. Set a new goal to keep going!",
      user: user,
      action_url: "/streak_goal"
    )
  end

  def self.mail_intro(user)
    first_name = user.display_name.split.first
    MailMessage.create!(
      summary: "Hey #{first_name}! I have VERY IMPORTANT UPDATES!",
      dismissable: false,
      content: <<~MARKDOWN,
        **1.** Deadline to reach 60h is **NOW JUNE 20TH!!**

        ---
        ---

        **2.** One random human who fills out our feedback form gets a **$25 USD Amazon Gift Card!** [forms.hackclub.com/fallout](https://forms.hackclub.com/fallout) (be truthful! answers don't affect your chances)

        ---


        **3.** **Need & Merit-based flight grants!!** (even if you don't think you'll get it, apply! If approved, we'll reimburse you after you reach 60h) [forms.hackclub.com/flyfallout](https://forms.hackclub.com/flyfallout)

        ---

        **4.** #{first_name}, don't think you can complete 60 hours on time? **DM @Anson Chung or @renran sun to owe us hours after the event!!**

        ---

        **5.** **GET TRAVEL GRANTS EVEN IF YOU DON'T BUILD IT IRL!** 7 Koi = $5 USD Travel Grant if you're not building your project (original rate still applies if you're building your projects irl - $8.5/hour for design + build hours)

        ---

        _now, feed me_

        — Soup

        ![Soup](/chineseHeidi.gif)
      MARKDOWN
      user: user
    )
  end

  def self.professors_announcement
    MailMessage.create!(
      summary: "Need help with your project?",
      content: "Introducing The Professors! These are mentors that can help you with your project, and redirect you when lost. Sign up below to mentor or be mentored!",
      action_url: "https://hackclub.slack.com/archives/C0ACG0XQWGN/p1777315115802199",
      action_label: "Sign up",
      pinned: true,
      dismissable: true,
      filters: { full_users_only: true }
    )
  end

  def self.streak_goal_completed(user, target_days)
    MailMessage.create!(
      summary: "You completed your #{target_days}-day streak goal! Set a new goal to keep going!",
      user: user,
      action_url: "/streak_goal"
    )
  end

  def self.blueprint_transfer(user, project_names)
    project_names = Array(project_names)
    noun    = project_names.one? ? "Blueprint" : "Blueprints"
    verb    = project_names.one? ? "has" : "have"
    list    = project_names.join(", ")
    MailMessage.create!(
      summary: "Your #{noun}: #{list} #{verb} been transferred!",
      content: "If something isn't as you're expecting, send us a message in #fallout-help.",
      user: user
    )
  end
end
