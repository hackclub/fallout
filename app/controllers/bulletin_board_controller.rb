class BulletinBoardController < ApplicationController
  allow_trial_access only: %i[index search] # Public community hub, trial users welcome
  skip_after_action :verify_authorized, only: %i[index search] # No authorizable resource (placeholder content)
  skip_after_action :verify_policy_scoped, only: %i[index search] # No scoped collection yet

  def index
    render inertia: "bulletin_board/index", props: {
      events: placeholder_events,
      featured: placeholder_featured,
      explore: placeholder_explore,
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def search
    render json: { explore: placeholder_explore }
  end

  private

  def placeholder_events
    [
      { title: "Lock-in Huddle with [NAME]", date: "Fri, April 3, 6:00PM" },
      { title: "Tamagotchi Workshop w", date: "Fri, April 3, 6:00PM" },
      { title: "[BLANK] Workshop w", date: "Fri, April 3, 6:00PM" }
    ]
  end

  def placeholder_featured
    [
      { image: "https://cdn.hackclub.com/019da253-bf73-7076-84c4-14ca42fe4781/jesuskeyboard.webp", title: "The biblically accurate keyboard", username: "Alex Tran" },
      { image: "https://cdn.hackclub.com/019da254-32dd-7eff-a250-15f538271cc1/minimaimai.webp", title: "Mini Maimai", username: "Tongyu" },
      { image: "https://cdn.hackclub.com/019da254-2ec5-719c-bd5e-b31f9a6a8be8/icepizero.webp", title: "Icepi Zero", username: "Cyao" },
      { image: "https://cdn.hackclub.com/019da254-3669-72bc-baf5-c0d7a0f5da52/splitwave.webp", title: "Split Wave", username: "Antush" }
    ]
  end

  def placeholder_explore
    # TODO: search/sort real projects (params[:q], params[:sort]) once Project data is wired up.
    [
      {
        username: "Alex Tran",
        date: "April 3, 2026",
        project_name: "Biblical Keyboard",
        content: "Shipped the first prototype — all 72 keys wired and responsive.",
        description: "A keyboard with biblically accurate layouts and angelic key travel.",
        tags: [ "hardware", "keyboard", "retro" ],
        likes: 42,
        comments: 7
      },
      {
        username: "Tongyu",
        date: "April 2, 2026",
        project_name: "Mini Maimai",
        content: "Drum pads now register hits within 5ms. Rhythm game feels real.",
        description: "A portable Maimai-style rhythm game console.",
        tags: [ "gamedev", "hardware" ],
        likes: 28,
        comments: 3
      },
      {
        username: "Cyao",
        date: "April 1, 2026",
        project_name: "Icepi Zero",
        content: "Got the custom PCB back from fab. All traces check out.",
        description: "A Raspberry Pi Zero form-factor board with integrated display.",
        tags: [ "hardware", "pcb" ],
        likes: 35,
        comments: 5
      },
      {
        username: "Antush",
        date: "March 30, 2026",
        project_name: "Split Wave",
        content: "First sound test — split keyboard now produces chords.",
        description: "An ergonomic split keyboard that doubles as a MIDI controller.",
        tags: [ "keyboard", "music" ],
        likes: 19,
        comments: 2
      }
    ]
  end
end
