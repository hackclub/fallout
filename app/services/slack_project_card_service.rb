class SlackProjectCardService
  def self.build_card_block(project:, project_url:, repo_url:, cover_image_url: nil, icon_url: nil)
    actions = [ {
      type: "button",
      text: { type: "plain_text", text: "View Project", emoji: false },
      action_id: "view_project",
      url: project_url
    } ]

    if repo_url.present?
      actions << {
        type: "button",
        text: { type: "plain_text", text: "GitHub", emoji: false },
        action_id: "view_repo",
        url: repo_url
      }
    end

    card = {
      type: "card",
      icon: {
        type: "image",
        image_url: icon_url || project.user.avatar,
        alt_text: project.user.display_name
      },
      title: { type: "mrkdwn", text: project.name, verbatim: false },
      subtitle: { type: "mrkdwn", text: project.user.display_name, verbatim: false },
      body: { type: "mrkdwn", text: project.description.to_s.truncate(280), verbatim: false },
      actions: actions
    }

    if cover_image_url.present?
      card[:hero_image] = {
        type: "image",
        image_url: cover_image_url,
        alt_text: "#{project.name} cover image"
      }
    end

    card
  end
end
