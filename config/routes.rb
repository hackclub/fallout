# == Route Map
#
# Routes for application:
#                                        Prefix Verb   URI Pattern                                                                                   Controller#Action
#                                               GET    /(*path)(.:format)                                                                            redirect(301) {host: "127.0.0.1"}
#                                    admin_root GET    /admin(.:format)                                                                              admin/dashboard#index
#            heartbeat_admin_reviews_time_audit POST   /admin/reviews/time_audits/:id/heartbeat(.:format)                                            admin/reviews/time_audits#heartbeat
#                next_admin_reviews_time_audits GET    /admin/reviews/time_audits/next(.:format)                                                     admin/reviews/time_audits#next
#                     admin_reviews_time_audits GET    /admin/reviews/time_audits(.:format)                                                          admin/reviews/time_audits#index
#                      admin_reviews_time_audit GET    /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#show
#                                               PATCH  /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#update
#                                               PUT    /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#update
#    heartbeat_admin_reviews_requirements_check POST   /admin/reviews/requirements_checks/:id/heartbeat(.:format)                                    admin/reviews/requirements_checks#heartbeat
# refresh_tree_admin_reviews_requirements_check POST   /admin/reviews/requirements_checks/:id/refresh_tree(.:format)                                 admin/reviews/requirements_checks#refresh_tree
#        next_admin_reviews_requirements_checks GET    /admin/reviews/requirements_checks/next(.:format)                                             admin/reviews/requirements_checks#next
#             admin_reviews_requirements_checks GET    /admin/reviews/requirements_checks(.:format)                                                  admin/reviews/requirements_checks#index
#              admin_reviews_requirements_check GET    /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#show
#                                               PATCH  /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#update
#                                               PUT    /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#update
#         heartbeat_admin_reviews_design_review POST   /admin/reviews/design_reviews/:id/heartbeat(.:format)                                         admin/reviews/design_reviews#heartbeat
#             next_admin_reviews_design_reviews GET    /admin/reviews/design_reviews/next(.:format)                                                  admin/reviews/design_reviews#next
#                  admin_reviews_design_reviews GET    /admin/reviews/design_reviews(.:format)                                                       admin/reviews/design_reviews#index
#                   admin_reviews_design_review GET    /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#show
#                                               PATCH  /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#update
#                                               PUT    /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#update
#          heartbeat_admin_reviews_build_review POST   /admin/reviews/build_reviews/:id/heartbeat(.:format)                                          admin/reviews/build_reviews#heartbeat
#              next_admin_reviews_build_reviews GET    /admin/reviews/build_reviews/next(.:format)                                                   admin/reviews/build_reviews#next
#                   admin_reviews_build_reviews GET    /admin/reviews/build_reviews(.:format)                                                        admin/reviews/build_reviews#index
#                    admin_reviews_build_review GET    /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#show
#                                               PATCH  /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#update
#                                               PUT    /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#update
#                           admin_project_flags GET    /admin/project_flags(.:format)                                                                admin/project_flags#index
#                                               POST   /admin/project_flags(.:format)                                                                admin/project_flags#create
#                            admin_project_flag DELETE /admin/project_flags/:id(.:format)                                                            admin/project_flags#destroy
#                  admin_project_reviewer_notes POST   /admin/projects/:project_id/reviewer_notes(.:format)                                          admin/reviewer_notes#create
#                   admin_project_reviewer_note PATCH  /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#update
#                                               PUT    /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#update
#                                               DELETE /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#destroy
#                                admin_projects GET    /admin/projects(.:format)                                                                     admin/projects#index
#                                 admin_project GET    /admin/projects/:id(.:format)                                                                 admin/projects#show
#                                   admin_users GET    /admin/users(.:format)                                                                        admin/users#index
#                                    admin_user GET    /admin/users/:id(.:format)                                                                    admin/users#show
#                                   admin_ships GET    /admin/reviews(.:format)                                                                      admin/ships#index
#                                    admin_ship GET    /admin/reviews/:id(.:format)                                                                  admin/ships#show
#                          mission_control_jobs        /jobs                                                                                         MissionControl::Jobs::Engine
#                                                      /flipper                                                                                      Flipper::UI
#                       update_roles_admin_user PATCH  /admin/users/:id/update_roles(.:format)                                                       admin/users#update_roles
#                  update_streak_day_admin_user PATCH  /admin/users/:id/update_streak_day(.:format)                                                  admin/users#update_streak_day
#                         admin_activity_checks POST   /admin/activity_checks(.:format)                                                              admin/activity_checks#create
#                      new_admin_activity_check GET    /admin/activity_checks/new(.:format)                                                          admin/activity_checks#new
#                              admin_shop_items GET    /admin/shop_items(.:format)                                                                   admin/shop_items#index
#                                               POST   /admin/shop_items(.:format)                                                                   admin/shop_items#create
#                               admin_shop_item PATCH  /admin/shop_items/:id(.:format)                                                               admin/shop_items#update
#                                               PUT    /admin/shop_items/:id(.:format)                                                               admin/shop_items#update
#                                               DELETE /admin/shop_items/:id(.:format)                                                               admin/shop_items#destroy
#                             admin_shop_orders GET    /admin/shop_orders(.:format)                                                                  admin/shop_orders#index
#                              admin_shop_order GET    /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#show
#                                               PATCH  /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#update
#                                               PUT    /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#update
#                        admin_koi_transactions GET    /admin/koi_transactions(.:format)                                                             admin/koi_transactions#index
#                                               POST   /admin/koi_transactions(.:format)                                                             admin/koi_transactions#create
#                     new_admin_koi_transaction GET    /admin/koi_transactions/new(.:format)                                                         admin/koi_transactions#new
#                            rails_health_check GET    /up(.:format)                                                                                 rails/health#show
#                                          root GET    /                                                                                             landing#index
#                                        signin GET    /auth/hca/start(.:format)                                                                     auth#new
#                                  hca_callback GET    /auth/hca/callback(.:format)                                                                  auth#create
#                                       signout DELETE /auth/signout(.:format)                                                                       auth#destroy
#                                   lapse_start GET    /auth/lapse/start(.:format)                                                                   lapse_auth#start
#                                lapse_callback GET    /auth/lapse/callback(.:format)                                                                lapse_auth#callback
#                                     hcb_start GET    /auth/hcb/start(.:format)                                                                     hcb_auth#start
#                                  hcb_callback GET    /auth/hcb/callback(.:format)                                                                  hcb_auth#callback
#                                hcb_disconnect DELETE /auth/hcb(.:format)                                                                           hcb_auth#destroy
#                                 trial_session POST   /trial_session(.:format)                                                                      trial_sessions#create
#                                          rsvp POST   /rsvp(.:format)                                                                               rsvps#create
#                                         sorry GET    /sorry(.:format)                                                                              bans#show
#                                    onboarding GET    /onboarding(.:format)                                                                         onboarding#show
#                                               POST   /onboarding(.:format)                                                                         onboarding#update
#                                          path GET    /path(.:format)                                                                               path#index
#                                   streak_goal GET    /streak_goal(.:format)                                                                        streak_goals#show
#                                               DELETE /streak_goal(.:format)                                                                        streak_goals#destroy
#                                               POST   /streak_goal(.:format)                                                                        streak_goals#create
#                     mark_seen_dialog_campaign POST   /dialog_campaigns/:key/mark_seen(.:format)                                                    dialog_campaigns#mark_seen
#                                       critter GET    /spin/:id(.:format)                                                                           critters#show
#                                               PATCH  /spin/:id(.:format)                                                                           critters#update
#                                               PUT    /spin/:id(.:format)                                                                           critters#update
#                                      clearing GET    /clearing(.:format)                                                                           clearing#index
#                                  dismiss_mail POST   /mails/:id/dismiss(.:format)                                                                  mails#dismiss
#                                read_all_mails POST   /mails/read_all(.:format)                                                                     mails#read_all
#                                         mails GET    /mails(.:format)                                                                              mails#index
#                                          mail GET    /mails/:id(.:format)                                                                          mails#show
#                           onboarding_projects GET    /projects/onboarding(.:format)                                                                projects#onboarding
#                       project_journal_entries POST   /projects/:project_id/journal_entries(.:format)                                               journal_entries#create
#                     new_project_journal_entry GET    /projects/:project_id/journal_entries/new(.:format)                                           journal_entries#new
#                 project_collaboration_invites POST   /projects/:project_id/collaboration_invites(.:format)                                         projects/collaboration_invites#create
#                  project_collaboration_invite DELETE /projects/:project_id/collaboration_invites/:id(.:format)                                     projects/collaboration_invites#destroy
#                                  project_ship GET    /projects/:project_id/ship(.:format)                                                          projects/ships#preflight
#                       preflight_project_ships GET    /projects/:project_id/ships/preflight(.:format)                                               projects/ships#preflight
#                   preflight_run_project_ships POST   /projects/:project_id/ships/preflight/run(.:format)                                           projects/ships#run
#                preflight_status_project_ships GET    /projects/:project_id/ships/preflight/status(.:format)                                        projects/ships#status
#                                 project_ships POST   /projects/:project_id/ships(.:format)                                                         projects/ships#create
#                                      projects GET    /projects(.:format)                                                                           projects#index
#                                               POST   /projects(.:format)                                                                           projects#create
#                                   new_project GET    /projects/new(.:format)                                                                       projects#new
#                                  edit_project GET    /projects/:id/edit(.:format)                                                                  projects#edit
#                                       project GET    /projects/:id(.:format)                                                                       projects#show
#                                               PATCH  /projects/:id(.:format)                                                                       projects#update
#                                               PUT    /projects/:id(.:format)                                                                       projects#update
#                                               DELETE /projects/:id(.:format)                                                                       projects#destroy
#                   accept_collaboration_invite POST   /collaboration_invites/:id/accept(.:format)                                                   collaboration_invites#accept
#                  decline_collaboration_invite POST   /collaboration_invites/:id/decline(.:format)                                                  collaboration_invites#decline
#                          collaboration_invite GET    /collaboration_invites/:id(.:format)                                                          collaboration_invites#show
#                                pending_invite GET    /i/:token(.:format)                                                                           pending_collaboration_invites#show
#                             new_journal_entry GET    /journal_entries/new(.:format)                                                                journal_entries#new
#                         preview_journal_entry POST   /journal_entries/preview(.:format)                                                            journal_entries#preview
#                         lookup_you_tube_video POST   /you_tube_videos/lookup(.:format)                                                             you_tube_videos#lookup
#                       record_lookout_sessions GET    /lookout_sessions/record(.:format)                                                            lookout_sessions#record
#                           new_lookout_session GET    /lookout_sessions/new(.:format)                                                               lookout_sessions#new
#                         shop_item_shop_orders POST   /shop/:shop_item_id/orders(.:format)                                                          shop_orders#create
#                      new_shop_item_shop_order GET    /shop/:shop_item_id/orders/new(.:format)                                                      shop_orders#new
#                          shop_item_shop_order GET    /shop/:shop_item_id/orders/:id(.:format)                                                      shop_orders#show
#                                    shop_items GET    /shop(.:format)                                                                               shop_items#index
#                                     shop_item GET    /shop/:id(.:format)                                                                           shop_items#show
#                                           faq GET    /faq(.:format)                                                                                redirect(301, /docs/faq)
#                                          info GET    /info(.:format)                                                                               redirect(301, /docs)
#                                         about GET    /about(.:format)                                                                              redirect(301, /docs)
#                                          docs GET    /docs(.:format)                                                                               markdown#show
#                                           doc GET    /docs/*slug(.:format)                                                                         markdown#show
#                               api_v1_projects GET    /api/v1/projects(.:format)                                                                    api/v1/projects#index
#                                api_v1_project GET    /api/v1/projects/:id(.:format)                                                                api/v1/projects#show
#              turbo_recede_historical_location GET    /recede_historical_location(.:format)                                                         turbo/native/navigation#recede
#              turbo_resume_historical_location GET    /resume_historical_location(.:format)                                                         turbo/native/navigation#resume
#             turbo_refresh_historical_location GET    /refresh_historical_location(.:format)                                                        turbo/native/navigation#refresh
#                 rails_postmark_inbound_emails POST   /rails/action_mailbox/postmark/inbound_emails(.:format)                                       action_mailbox/ingresses/postmark/inbound_emails#create
#                    rails_relay_inbound_emails POST   /rails/action_mailbox/relay/inbound_emails(.:format)                                          action_mailbox/ingresses/relay/inbound_emails#create
#                 rails_sendgrid_inbound_emails POST   /rails/action_mailbox/sendgrid/inbound_emails(.:format)                                       action_mailbox/ingresses/sendgrid/inbound_emails#create
#           rails_mandrill_inbound_health_check GET    /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#health_check
#                 rails_mandrill_inbound_emails POST   /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#create
#                  rails_mailgun_inbound_emails POST   /rails/action_mailbox/mailgun/inbound_emails/mime(.:format)                                   action_mailbox/ingresses/mailgun/inbound_emails#create
#                rails_conductor_inbound_emails GET    /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#index
#                                               POST   /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#create
#             new_rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/new(.:format)                                  rails/conductor/action_mailbox/inbound_emails#new
#                 rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/:id(.:format)                                  rails/conductor/action_mailbox/inbound_emails#show
#      new_rails_conductor_inbound_email_source GET    /rails/conductor/action_mailbox/inbound_emails/sources/new(.:format)                          rails/conductor/action_mailbox/inbound_emails/sources#new
#         rails_conductor_inbound_email_sources POST   /rails/conductor/action_mailbox/inbound_emails/sources(.:format)                              rails/conductor/action_mailbox/inbound_emails/sources#create
#         rails_conductor_inbound_email_reroute POST   /rails/conductor/action_mailbox/:inbound_email_id/reroute(.:format)                           rails/conductor/action_mailbox/reroutes#create
#      rails_conductor_inbound_email_incinerate POST   /rails/conductor/action_mailbox/:inbound_email_id/incinerate(.:format)                        rails/conductor/action_mailbox/incinerates#create
#                            rails_service_blob GET    /user-attachments/blobs/redirect/:signed_id/*filename(.:format)                               active_storage/blobs/redirect#show
#                      rails_service_blob_proxy GET    /user-attachments/blobs/proxy/:signed_id/*filename(.:format)                                  active_storage/blobs/proxy#show
#                                               GET    /user-attachments/blobs/:signed_id/*filename(.:format)                                        active_storage/blobs/redirect#show
#                     rails_blob_representation GET    /user-attachments/representations/redirect/:signed_blob_id/:variation_key/*filename(.:format) active_storage/representations/redirect#show
#               rails_blob_representation_proxy GET    /user-attachments/representations/proxy/:signed_blob_id/:variation_key/*filename(.:format)    active_storage/representations/proxy#show
#                                               GET    /user-attachments/representations/:signed_blob_id/:variation_key/*filename(.:format)          active_storage/representations/redirect#show
#                            rails_disk_service GET    /user-attachments/disk/:encoded_key/*filename(.:format)                                       active_storage/disk#show
#                     update_rails_disk_service PUT    /user-attachments/disk/:encoded_token(.:format)                                               active_storage/disk#update
#                          rails_direct_uploads POST   /user-attachments/direct_uploads(.:format)                                                    active_storage/direct_uploads#create
#
# Routes for MissionControl::Jobs::Engine:
#                      Prefix Verb   URI Pattern                                                    Controller#Action
#     application_queue_pause DELETE /applications/:application_id/queues/:queue_id/pause(.:format) mission_control/jobs/queues/pauses#destroy
#                             POST   /applications/:application_id/queues/:queue_id/pause(.:format) mission_control/jobs/queues/pauses#create
#          application_queues GET    /applications/:application_id/queues(.:format)                 mission_control/jobs/queues#index
#           application_queue GET    /applications/:application_id/queues/:id(.:format)             mission_control/jobs/queues#show
#       application_job_retry POST   /applications/:application_id/jobs/:job_id/retry(.:format)     mission_control/jobs/retries#create
#     application_job_discard POST   /applications/:application_id/jobs/:job_id/discard(.:format)   mission_control/jobs/discards#create
#    application_job_dispatch POST   /applications/:application_id/jobs/:job_id/dispatch(.:format)  mission_control/jobs/dispatches#create
#    application_bulk_retries POST   /applications/:application_id/jobs/bulk_retries(.:format)      mission_control/jobs/bulk_retries#create
#   application_bulk_discards POST   /applications/:application_id/jobs/bulk_discards(.:format)     mission_control/jobs/bulk_discards#create
#             application_job GET    /applications/:application_id/jobs/:id(.:format)               mission_control/jobs/jobs#show
#            application_jobs GET    /applications/:application_id/:status/jobs(.:format)           mission_control/jobs/jobs#index
#         application_workers GET    /applications/:application_id/workers(.:format)                mission_control/jobs/workers#index
#          application_worker GET    /applications/:application_id/workers/:id(.:format)            mission_control/jobs/workers#show
# application_recurring_tasks GET    /applications/:application_id/recurring_tasks(.:format)        mission_control/jobs/recurring_tasks#index
#  application_recurring_task GET    /applications/:application_id/recurring_tasks/:id(.:format)    mission_control/jobs/recurring_tasks#show
#                             PATCH  /applications/:application_id/recurring_tasks/:id(.:format)    mission_control/jobs/recurring_tasks#update
#                             PUT    /applications/:application_id/recurring_tasks/:id(.:format)    mission_control/jobs/recurring_tasks#update
#                      queues GET    /queues(.:format)                                              mission_control/jobs/queues#index
#                       queue GET    /queues/:id(.:format)                                          mission_control/jobs/queues#show
#                         job GET    /jobs/:id(.:format)                                            mission_control/jobs/jobs#show
#                        jobs GET    /:status/jobs(.:format)                                        mission_control/jobs/jobs#index
#                        root GET    /                                                              mission_control/jobs/queues#index

Rails.application.routes.draw do
  # Redirect to localhost from 127.0.0.1 to use same IP address with Vite server
  constraints(host: "127.0.0.1") do
    get "(*path)", to: redirect { |params, req| "#{req.protocol}localhost:#{req.port}/#{params[:path]}" }
  end
  constraints Constraints::StaffConstraint.new do
    namespace :admin do
      get "/" => "dashboard#index", as: :root

      # Per-type review queues must be defined before the catch-all ships resource
      namespace :reviews do
        resources :time_audits, only: [ :index, :show, :update ] do
          member { post :heartbeat }
          collection { get :next }
        end
        resources :requirements_checks, only: [ :index, :show, :update ] do
          member do
            post :heartbeat
            post :refresh_tree
            get :gerber_zip_files
          end
          collection { get :next }
        end
        resources :design_reviews, only: [ :index, :show, :update ] do
          member { post :heartbeat }
          collection { get :next }
        end
        resources :build_reviews, only: [ :index, :show, :update ] do
          member { post :heartbeat }
          collection { get :next }
        end
      end

      resources :project_flags, only: [ :index, :create, :destroy ]

      resources :projects, only: [ :index, :show ] do
        resources :reviewer_notes, only: [ :create, :update, :destroy ]
      end
      resources :users, only: [ :index, :show ]

      resources :ships, only: [ :index, :show ], path: "reviews"
    end
  end

  constraints Constraints::AdminConstraint.new do
    mount MissionControl::Jobs::Engine, at: "/jobs"
    mount Flipper::UI.app(Flipper), at: "/flipper" # Feature flag dashboard — admin-only

    namespace :admin do
      resources :users, only: [] do
        member do
          patch :update_roles
          patch :update_streak_day # Admin streak day status override
        end
      end
      resources :activity_checks, only: [ :new, :create ]
      resources :shop_items, only: [ :index, :create, :update, :destroy ] # Admin shop item management
      resources :shop_orders, only: [ :index, :show, :update ] # Admin order management
      resources :koi_transactions, only: [ :index, :new, :create ] # Admin koi adjustments
      resources :you_tube_videos, only: [] do
        member do
          post :refetch # Re-fetch YouTube metadata for videos with missing duration
        end
      end
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check

  root "landing#index"

  get "auth/hca/start" => "auth#new", as: :signin
  get "auth/hca/callback" => "auth#create", as: :hca_callback
  delete "auth/signout" => "auth#destroy", as: :signout

  get "auth/lapse/start" => "lapse_auth#start", as: :lapse_start
  get "auth/lapse/callback" => "lapse_auth#callback", as: :lapse_callback

  get "auth/hcb/start" => "hcb_auth#start", as: :hcb_start
  get "auth/hcb/callback" => "hcb_auth#callback", as: :hcb_callback
  delete "auth/hcb" => "hcb_auth#destroy", as: :hcb_disconnect

  post "trial_session" => "trial_sessions#create", as: :trial_session
  post "rsvp" => "rsvps#create", as: :rsvp

  get "sorry" => "bans#show", as: :sorry

  get "onboarding" => "onboarding#show", as: :onboarding
  post "onboarding" => "onboarding#update"

  get "path" => "path#index", as: :path

  resource :streak_goal, only: [ :show, :create, :destroy ]

  # Campaign-based dialog system — marks a one-time dialog as seen via plain fetch (not Inertia)
  post "dialog_campaigns/:key/mark_seen", to: "dialog_campaigns#mark_seen", as: :mark_seen_dialog_campaign

  resources :critters, only: [ :show, :update ], path: "spin" # Gacha spin reveal page
  get "clearing" => "clearing#index", as: :clearing

  resources :mails, only: [ :index, :show ], controller: "mails" do
    post :dismiss, on: :member
    post :read_all, on: :collection
  end

  resources :projects do
    get "onboarding", on: :collection # Project onboarding modal accessed from path page
    resources :journal_entries, only: [ :new, :create ]
    resources :collaboration_invites, only: [ :create, :destroy ], module: :projects # Send and revoke project collaboration invites
    get :ship, controller: "projects/ships", action: :preflight # /projects/:id/ship — multi-step submission page
    resources :ships, only: [ :create ], module: :projects do
      collection do
        get :preflight # Legacy route — redirects to /projects/:id/ship
        post "preflight/run", action: :run # Frontend kicks off preflight scan
        get "preflight/status", action: :status # Polled by frontend for real-time check updates
      end
    end
  end

  resources :collaboration_invites, only: [ :show ] do
    member do
      post :accept # Invitee accepts the collaboration invite
      post :decline # Invitee declines the collaboration invite
    end
  end

  # Universal invite link from emails — works for any auth state
  get "i/:token" => "pending_collaboration_invites#show", as: :pending_invite

  # Top-level journal entry point — redirects to project-scoped route or shows project selection
  get "journal_entries/new" => "journal_entries#new", as: :new_journal_entry
  post "journal_entries/preview" => "journal_entries#preview", as: :preview_journal_entry
  post "you_tube_videos/lookup" => "you_tube_videos#lookup", as: :lookup_you_tube_video
  resources :lookout_sessions, only: %i[new] do
    get :record, on: :collection # Token-based recording page: /lookout_sessions/record?token=...
  end

  resources :shop_items, path: "shop", only: [ :index, :show ] do # Koi shop (admin CRUD via /admin/shop_items)
    resources :shop_orders, only: [ :new, :create, :show ], path: "orders" # Purchase flow
  end

  # Adblocker-safe tracking redirects — sets utm_source on Ahoy visit without query params
  %w[infill rmrrf infill-2026 rmrrf-2026].each do |slug|
    get slug => "tracking_redirects#show", defaults: { slug: slug }
  end

  get "faq" => redirect("/docs/faq") # Shortcut to FAQ docs page
  get "info" => redirect("/docs")
  get "about" => redirect("/docs")
  get "docs" => "markdown#show", as: :docs
  get "docs/*slug" => "markdown#show", as: :doc

  namespace :api do
    namespace :v1 do
      resources :projects, only: [ :index, :show ]
    end
  end
end
