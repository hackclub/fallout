# == Route Map
#
# Routes for application:
#                                   Prefix Verb   URI Pattern                                                                                   Controller#Action
#                                          GET    /(*path)(.:format)                                                                            redirect(301) {host: "127.0.0.1"}
#                               admin_root GET    /admin(.:format)                                                                              admin/static_pages#index
#                              admin_ships GET    /admin/reviews(.:format)                                                                      admin/ships#index
#                          edit_admin_ship GET    /admin/reviews/:id/edit(.:format)                                                             admin/ships#edit
#                               admin_ship GET    /admin/reviews/:id(.:format)                                                                  admin/ships#show
#                                          PATCH  /admin/reviews/:id(.:format)                                                                  admin/ships#update
#                                          PUT    /admin/reviews/:id(.:format)                                                                  admin/ships#update
#                     mission_control_jobs        /jobs                                                                                         MissionControl::Jobs::Engine
#                           admin_projects GET    /admin/projects(.:format)                                                                     admin/projects#index
#                            admin_project GET    /admin/projects/:id(.:format)                                                                 admin/projects#show
#                              admin_users GET    /admin/users(.:format)                                                                        admin/users#index
#                               admin_user GET    /admin/users/:id(.:format)                                                                    admin/users#show
#                       rails_health_check GET    /up(.:format)                                                                                 rails/health#show
#                                     root GET    /                                                                                             landing#index
#                                   signin GET    /auth/hca/start(.:format)                                                                     auth#new
#                             hca_callback GET    /auth/hca/callback(.:format)                                                                  auth#create
#                                  signout DELETE /auth/signout(.:format)                                                                       auth#destroy
#                              lapse_start GET    /auth/lapse/start(.:format)                                                                   lapse_auth#start
#                           lapse_callback GET    /auth/lapse/callback(.:format)                                                                lapse_auth#callback
#                            trial_session POST   /trial_session(.:format)                                                                      trial_sessions#create
#                                     rsvp POST   /rsvp(.:format)                                                                               rsvps#create
#                                    sorry GET    /sorry(.:format)                                                                              bans#show
#                               onboarding GET    /onboarding(.:format)                                                                         onboarding#show
#                                          POST   /onboarding(.:format)                                                                         onboarding#update
#                                     path GET    /path(.:format)                                                                               path#index
#                             dismiss_mail POST   /mails/:id/dismiss(.:format)                                                                  mails#dismiss
#                           read_all_mails POST   /mails/read_all(.:format)                                                                     mails#read_all
#                                    mails GET    /mails(.:format)                                                                              mails#index
#                                     mail GET    /mails/:id(.:format)                                                                          mails#show
#                      onboarding_projects GET    /projects/onboarding(.:format)                                                                projects#onboarding
#                  project_journal_entries POST   /projects/:project_id/journal_entries(.:format)                                               journal_entries#create
#                new_project_journal_entry GET    /projects/:project_id/journal_entries/new(.:format)                                           journal_entries#new
#                                 projects GET    /projects(.:format)                                                                           projects#index
#                                          POST   /projects(.:format)                                                                           projects#create
#                              new_project GET    /projects/new(.:format)                                                                       projects#new
#                             edit_project GET    /projects/:id/edit(.:format)                                                                  projects#edit
#                                  project GET    /projects/:id(.:format)                                                                       projects#show
#                                          PATCH  /projects/:id(.:format)                                                                       projects#update
#                                          PUT    /projects/:id(.:format)                                                                       projects#update
#                                          DELETE /projects/:id(.:format)                                                                       projects#destroy
#                        new_journal_entry GET    /journal_entries/new(.:format)                                                                journal_entries#new
#                    preview_journal_entry POST   /journal_entries/preview(.:format)                                                            journal_entries#preview
#                    lookup_you_tube_video POST   /you_tube_videos/lookup(.:format)                                                             you_tube_videos#lookup
#                                      faq GET    /faq(.:format)                                                                                redirect(301, /docs/faq)
#                                     info GET    /info(.:format)                                                                               redirect(301, /docs)
#                                    about GET    /about(.:format)                                                                              redirect(301, /docs)
#                                     docs GET    /docs(.:format)                                                                               markdown#show
#                                      doc GET    /docs/*slug(.:format)                                                                         markdown#show
#                          api_v1_projects GET    /api/v1/projects(.:format)                                                                    api/v1/projects#index
#                           api_v1_project GET    /api/v1/projects/:id(.:format)                                                                api/v1/projects#show
#         turbo_recede_historical_location GET    /recede_historical_location(.:format)                                                         turbo/native/navigation#recede
#         turbo_resume_historical_location GET    /resume_historical_location(.:format)                                                         turbo/native/navigation#resume
#        turbo_refresh_historical_location GET    /refresh_historical_location(.:format)                                                        turbo/native/navigation#refresh
#            rails_postmark_inbound_emails POST   /rails/action_mailbox/postmark/inbound_emails(.:format)                                       action_mailbox/ingresses/postmark/inbound_emails#create
#               rails_relay_inbound_emails POST   /rails/action_mailbox/relay/inbound_emails(.:format)                                          action_mailbox/ingresses/relay/inbound_emails#create
#            rails_sendgrid_inbound_emails POST   /rails/action_mailbox/sendgrid/inbound_emails(.:format)                                       action_mailbox/ingresses/sendgrid/inbound_emails#create
#      rails_mandrill_inbound_health_check GET    /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#health_check
#            rails_mandrill_inbound_emails POST   /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#create
#             rails_mailgun_inbound_emails POST   /rails/action_mailbox/mailgun/inbound_emails/mime(.:format)                                   action_mailbox/ingresses/mailgun/inbound_emails#create
#           rails_conductor_inbound_emails GET    /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#index
#                                          POST   /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#create
#        new_rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/new(.:format)                                  rails/conductor/action_mailbox/inbound_emails#new
#            rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/:id(.:format)                                  rails/conductor/action_mailbox/inbound_emails#show
# new_rails_conductor_inbound_email_source GET    /rails/conductor/action_mailbox/inbound_emails/sources/new(.:format)                          rails/conductor/action_mailbox/inbound_emails/sources#new
#    rails_conductor_inbound_email_sources POST   /rails/conductor/action_mailbox/inbound_emails/sources(.:format)                              rails/conductor/action_mailbox/inbound_emails/sources#create
#    rails_conductor_inbound_email_reroute POST   /rails/conductor/action_mailbox/:inbound_email_id/reroute(.:format)                           rails/conductor/action_mailbox/reroutes#create
# rails_conductor_inbound_email_incinerate POST   /rails/conductor/action_mailbox/:inbound_email_id/incinerate(.:format)                        rails/conductor/action_mailbox/incinerates#create
#                       rails_service_blob GET    /user-attachments/blobs/redirect/:signed_id/*filename(.:format)                               active_storage/blobs/redirect#show
#                 rails_service_blob_proxy GET    /user-attachments/blobs/proxy/:signed_id/*filename(.:format)                                  active_storage/blobs/proxy#show
#                                          GET    /user-attachments/blobs/:signed_id/*filename(.:format)                                        active_storage/blobs/redirect#show
#                rails_blob_representation GET    /user-attachments/representations/redirect/:signed_blob_id/:variation_key/*filename(.:format) active_storage/representations/redirect#show
#          rails_blob_representation_proxy GET    /user-attachments/representations/proxy/:signed_blob_id/:variation_key/*filename(.:format)    active_storage/representations/proxy#show
#                                          GET    /user-attachments/representations/:signed_blob_id/:variation_key/*filename(.:format)          active_storage/representations/redirect#show
#                       rails_disk_service GET    /user-attachments/disk/:encoded_key/*filename(.:format)                                       active_storage/disk#show
#                update_rails_disk_service PUT    /user-attachments/disk/:encoded_token(.:format)                                               active_storage/disk#update
#                     rails_direct_uploads POST   /user-attachments/direct_uploads(.:format)                                                    active_storage/direct_uploads#create
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
      get "/" => "static_pages#index", as: :root
      resources :ships, only: [ :index, :show, :edit, :update ], path: "reviews"
    end
  end

  constraints Constraints::AdminConstraint.new do
    mount MissionControl::Jobs::Engine, at: "/jobs"
    mount Flipper::UI.app(Flipper), at: "/flipper" # Feature flag dashboard — admin-only

    namespace :admin do
      resources :projects, only: [ :index, :show ]
      resources :users, only: [ :index, :show ]
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check

  root "landing#index"

  get "auth/hca/start" => "auth#new", as: :signin
  get "auth/hca/callback" => "auth#create", as: :hca_callback
  delete "auth/signout" => "auth#destroy", as: :signout

  get "auth/lapse/start" => "lapse_auth#start", as: :lapse_start
  get "auth/lapse/callback" => "lapse_auth#callback", as: :lapse_callback

  post "trial_session" => "trial_sessions#create", as: :trial_session
  post "rsvp" => "rsvps#create", as: :rsvp

  get "sorry" => "bans#show", as: :sorry

  get "onboarding" => "onboarding#show", as: :onboarding
  post "onboarding" => "onboarding#update"

  get "path" => "path#index", as: :path

  resources :mails, only: [ :index, :show ], controller: "mails" do
    post :dismiss, on: :member
    post :read_all, on: :collection
  end

  resources :projects do
    get "onboarding", on: :collection # Project onboarding modal accessed from path page
    resources :journal_entries, only: [ :new, :create ]
  end

  # Top-level journal entry point — redirects to project-scoped route or shows project selection
  get "journal_entries/new" => "journal_entries#new", as: :new_journal_entry
  post "journal_entries/preview" => "journal_entries#preview", as: :preview_journal_entry
  post "you_tube_videos/lookup" => "you_tube_videos#lookup", as: :lookup_you_tube_video
  resources :collapse_sessions, only: %i[new] do
    get :record, on: :collection # Token-based recording page: /collapse_sessions/record?token=...
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
