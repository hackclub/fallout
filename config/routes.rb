# == Route Map
#
# Routes for application:
#                                             Prefix Verb   URI Pattern                                                                                   Controller#Action
#                                                    GET    /(*path)(.:format)                                                                            redirect(301) {host: "127.0.0.1"}
#                admin_requirements_design_dashboard GET    /admin/dashboard/requirements_design(.:format)                                                admin/dashboard#requirements_design
#                           admin_ta_stats_dashboard GET    /admin/dashboard/ta_stats(.:format)                                                           admin/dashboard#ta_stats
#                                admin_dev_dashboard GET    /admin/dashboard/dev(.:format)                                                                admin/dashboard#dev
#                                         admin_root GET    /admin(.:format)                                                                              admin/dashboard#index
#                admin_reviewer_reviewer_admin_notes POST   /admin/reviewers/:reviewer_id/notes(.:format)                                                 admin/reviewer_admin_notes#create
#                 admin_reviewer_reviewer_admin_note PATCH  /admin/reviewers/:reviewer_id/notes/:id(.:format)                                             admin/reviewer_admin_notes#update
#                                                    PUT    /admin/reviewers/:reviewer_id/notes/:id(.:format)                                             admin/reviewer_admin_notes#update
#                                                    DELETE /admin/reviewers/:reviewer_id/notes/:id(.:format)                                             admin/reviewer_admin_notes#destroy
#           admin_reviewer_reviewer_unavailabilities POST   /admin/reviewers/:reviewer_id/unavailabilities(.:format)                                      admin/reviewer_unavailabilities#create
#             admin_reviewer_reviewer_unavailability DELETE /admin/reviewers/:reviewer_id/unavailabilities/:id(.:format)                                  admin/reviewer_unavailabilities#destroy
#      bulk_admin_reviewer_reviewer_week_resolutions POST   /admin/reviewers/:reviewer_id/week_resolutions/bulk(.:format)                                 admin/reviewer_week_resolutions#bulk_create
#           admin_reviewer_reviewer_week_resolutions POST   /admin/reviewers/:reviewer_id/week_resolutions(.:format)                                      admin/reviewer_week_resolutions#create
#            admin_reviewer_reviewer_week_resolution DELETE /admin/reviewers/:reviewer_id/week_resolutions/:id(.:format)                                  admin/reviewer_week_resolutions#destroy
#                                     admin_reviewer GET    /admin/reviewers/:id(.:format)                                                                admin/reviewers#show
#                 heartbeat_admin_reviews_time_audit POST   /admin/reviews/time_audits/:id/heartbeat(.:format)                                            admin/reviews/time_audits#heartbeat
#                     next_admin_reviews_time_audits GET    /admin/reviews/time_audits/next(.:format)                                                     admin/reviews/time_audits#next
#                          admin_reviews_time_audits GET    /admin/reviews/time_audits(.:format)                                                          admin/reviews/time_audits#index
#                           admin_reviews_time_audit GET    /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#show
#                                                    PATCH  /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#update
#                                                    PUT    /admin/reviews/time_audits/:id(.:format)                                                      admin/reviews/time_audits#update
#         heartbeat_admin_reviews_requirements_check POST   /admin/reviews/requirements_checks/:id/heartbeat(.:format)                                    admin/reviews/requirements_checks#heartbeat
#      refresh_tree_admin_reviews_requirements_check POST   /admin/reviews/requirements_checks/:id/refresh_tree(.:format)                                 admin/reviews/requirements_checks#refresh_tree
#             next_admin_reviews_requirements_checks GET    /admin/reviews/requirements_checks/next(.:format)                                             admin/reviews/requirements_checks#next
#                  admin_reviews_requirements_checks GET    /admin/reviews/requirements_checks(.:format)                                                  admin/reviews/requirements_checks#index
#                   admin_reviews_requirements_check GET    /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#show
#                                                    PATCH  /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#update
#                                                    PUT    /admin/reviews/requirements_checks/:id(.:format)                                              admin/reviews/requirements_checks#update
#              heartbeat_admin_reviews_design_review POST   /admin/reviews/design_reviews/:id/heartbeat(.:format)                                         admin/reviews/design_reviews#heartbeat
#              swap_type_admin_reviews_design_review POST   /admin/reviews/design_reviews/:id/swap_type(.:format)                                         admin/reviews/design_reviews#swap_type
#                  next_admin_reviews_design_reviews GET    /admin/reviews/design_reviews/next(.:format)                                                  admin/reviews/design_reviews#next
#                       admin_reviews_design_reviews GET    /admin/reviews/design_reviews(.:format)                                                       admin/reviews/design_reviews#index
#                        admin_reviews_design_review GET    /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#show
#                                                    PATCH  /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#update
#                                                    PUT    /admin/reviews/design_reviews/:id(.:format)                                                   admin/reviews/design_reviews#update
#               heartbeat_admin_reviews_build_review POST   /admin/reviews/build_reviews/:id/heartbeat(.:format)                                          admin/reviews/build_reviews#heartbeat
#               swap_type_admin_reviews_build_review POST   /admin/reviews/build_reviews/:id/swap_type(.:format)                                          admin/reviews/build_reviews#swap_type
#                   next_admin_reviews_build_reviews GET    /admin/reviews/build_reviews/next(.:format)                                                   admin/reviews/build_reviews#next
#                        admin_reviews_build_reviews GET    /admin/reviews/build_reviews(.:format)                                                        admin/reviews/build_reviews#index
#                         admin_reviews_build_review GET    /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#show
#                                                    PATCH  /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#update
#                                                    PUT    /admin/reviews/build_reviews/:id(.:format)                                                    admin/reviews/build_reviews#update
#                                 admin_reviews_mine GET    /admin/reviews/mine(.:format)                                                                 admin/reviews/my_reviews#show
#                         admin_reviews_user_reviews GET    /admin/reviews/mine/:user_id(.:format)                                                        admin/reviews/my_reviews#show
#                                admin_project_flags GET    /admin/project_flags(.:format)                                                                admin/project_flags#index
#                                                    POST   /admin/project_flags(.:format)                                                                admin/project_flags#create
#                                 admin_project_flag DELETE /admin/project_flags/:id(.:format)                                                            admin/project_flags#destroy
#                       admin_project_reviewer_notes POST   /admin/projects/:project_id/reviewer_notes(.:format)                                          admin/reviewer_notes#create
#                        admin_project_reviewer_note PATCH  /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#update
#                                                    PUT    /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#update
#                                                    DELETE /admin/projects/:project_id/reviewer_notes/:id(.:format)                                      admin/reviewer_notes#destroy
#                                     admin_projects GET    /admin/projects(.:format)                                                                     admin/projects#index
#                                      admin_project GET    /admin/projects/:id(.:format)                                                                 admin/projects#show
#                                        admin_users GET    /admin/users(.:format)                                                                        admin/users#index
#                                         admin_user GET    /admin/users/:id(.:format)                                                                    admin/users#show
#                                        admin_ships GET    /admin/reviews(.:format)                                                                      admin/ships#index
#                                         admin_ship GET    /admin/reviews/:id(.:format)                                                                  admin/ships#show
#                 bulk_destroy_admin_bulletin_events DELETE /admin/bulletin_events/bulk_destroy(.:format)                                                 admin/bulletin_events#bulk_destroy
#              destroy_expired_admin_bulletin_events DELETE /admin/bulletin_events/destroy_expired(.:format)                                              admin/bulletin_events#destroy_expired
#                     start_now_admin_bulletin_event PATCH  /admin/bulletin_events/:id/start_now(.:format)                                                admin/bulletin_events#start_now
#               force_start_now_admin_bulletin_event PATCH  /admin/bulletin_events/:id/force_start_now(.:format)                                          admin/bulletin_events#force_start_now
#                       end_now_admin_bulletin_event PATCH  /admin/bulletin_events/:id/end_now(.:format)                                                  admin/bulletin_events#end_now
#                              admin_bulletin_events GET    /admin/bulletin_events(.:format)                                                              admin/bulletin_events#index
#                                                    POST   /admin/bulletin_events(.:format)                                                              admin/bulletin_events#create
#                               admin_bulletin_event PATCH  /admin/bulletin_events/:id(.:format)                                                          admin/bulletin_events#update
#                                                    PUT    /admin/bulletin_events/:id(.:format)                                                          admin/bulletin_events#update
#                                                    DELETE /admin/bulletin_events/:id(.:format)                                                          admin/bulletin_events#destroy
#            projects_search_admin_featured_projects GET    /admin/featured_projects/projects_search(.:format)                                            admin/featured_projects#projects_search
#                    reorder_admin_featured_projects PATCH  /admin/featured_projects/reorder(.:format)                                                    admin/featured_projects#reorder
#                 update_note_admin_featured_project PATCH  /admin/featured_projects/:id/update_note(.:format)                                            admin/featured_projects#update_note
#                     restore_admin_featured_project PATCH  /admin/featured_projects/:id/restore(.:format)                                                admin/featured_projects#restore
#                            admin_featured_projects GET    /admin/featured_projects(.:format)                                                            admin/featured_projects#index
#                                                    POST   /admin/featured_projects(.:format)                                                            admin/featured_projects#create
#                             admin_featured_project DELETE /admin/featured_projects/:id(.:format)                                                        admin/featured_projects#destroy
#                               mission_control_jobs        /jobs                                                                                         MissionControl::Jobs::Engine
#                                                           /flipper                                                                                      Flipper::UI
#                update_manual_seconds_admin_project PATCH  /admin/projects/:id/update_manual_seconds(.:format)                                           admin/projects#update_manual_seconds
#                       toggle_burnout_admin_project PATCH  /admin/projects/:id/toggle_burnout(.:format)                                                  admin/projects#toggle_burnout
#                      toggle_unlisted_admin_project PATCH  /admin/projects/:id/toggle_unlisted(.:format)                                                 admin/projects#toggle_unlisted
#                            update_roles_admin_user PATCH  /admin/users/:id/update_roles(.:format)                                                       admin/users#update_roles
#                       update_streak_day_admin_user PATCH  /admin/users/:id/update_streak_day(.:format)                                                  admin/users#update_streak_day
#                     restore_streak_goal_admin_user PATCH  /admin/users/:id/restore_streak_goal(.:format)                                                admin/users#restore_streak_goal
#                              update_ban_admin_user PATCH  /admin/users/:id/update_ban(.:format)                                                         admin/users#update_ban
#            update_ticket_hours_override_admin_user PATCH  /admin/users/:id/update_ticket_hours_override(.:format)                                       admin/users#update_ticket_hours_override
#              toggle_reviewer_suggestion_admin_user PATCH  /admin/users/:id/toggle_reviewer_suggestion(.:format)                                         admin/users#toggle_reviewer_suggestion
#                              admin_activity_checks POST   /admin/activity_checks(.:format)                                                              admin/activity_checks#create
#                           new_admin_activity_check GET    /admin/activity_checks/new(.:format)                                                          admin/activity_checks#new
#                          refresh_admin_hours_stats POST   /admin/hours_stats/refresh(.:format)                                                          admin/hours_stats#refresh
#                                  admin_hours_stats GET    /admin/hours_stats(.:format)                                                                  admin/hours_stats#index
#                                   admin_shop_items GET    /admin/shop_items(.:format)                                                                   admin/shop_items#index
#                                                    POST   /admin/shop_items(.:format)                                                                   admin/shop_items#create
#                                    admin_shop_item PATCH  /admin/shop_items/:id(.:format)                                                               admin/shop_items#update
#                                                    PUT    /admin/shop_items/:id(.:format)                                                               admin/shop_items#update
#                                                    DELETE /admin/shop_items/:id(.:format)                                                               admin/shop_items#destroy
#                                  admin_shop_orders GET    /admin/shop_orders(.:format)                                                                  admin/shop_orders#index
#                                   admin_shop_order GET    /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#show
#                                                    PATCH  /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#update
#                                                    PUT    /admin/shop_orders/:id(.:format)                                                              admin/shop_orders#update
#                         approve_admin_ticket_claim PATCH  /admin/ticket_claims/:id/approve(.:format)                                                    admin/ticket_claims#approve
#                          reject_admin_ticket_claim PATCH  /admin/ticket_claims/:id/reject(.:format)                                                     admin/ticket_claims#reject
#                   bulk_approve_admin_ticket_claims PATCH  /admin/ticket_claims/bulk_approve(.:format)                                                   admin/ticket_claims#bulk_approve
#                    bulk_reject_admin_ticket_claims PATCH  /admin/ticket_claims/bulk_reject(.:format)                                                    admin/ticket_claims#bulk_reject
#                                admin_ticket_claims GET    /admin/ticket_claims(.:format)                                                                admin/ticket_claims#index
#                             admin_koi_transactions GET    /admin/koi_transactions(.:format)                                                             admin/koi_transactions#index
#                                                    POST   /admin/koi_transactions(.:format)                                                             admin/koi_transactions#create
#                          new_admin_koi_transaction GET    /admin/koi_transactions/new(.:format)                                                         admin/koi_transactions#new
#                       refetch_admin_you_tube_video POST   /admin/you_tube_videos/:id/refetch(.:format)                                                  admin/you_tube_videos#refetch
#               audience_preview_admin_soup_campaign GET    /admin/soup_campaigns/:id/audience_preview(.:format)                                          admin/soup_campaigns#audience_preview
#                  send_campaign_admin_soup_campaign POST   /admin/soup_campaigns/:id/send_campaign(.:format)                                             admin/soup_campaigns#send_campaign
#                      test_send_admin_soup_campaign POST   /admin/soup_campaigns/:id/test_send(.:format)                                                 admin/soup_campaigns#test_send
#                         cancel_admin_soup_campaign POST   /admin/soup_campaigns/:id/cancel(.:format)                                                    admin/soup_campaigns#cancel
#   toggle_recipient_unsubscribe_admin_soup_campaign POST   /admin/soup_campaigns/:id/recipients/:recipient_id/toggle_unsubscribe(.:format)               admin/soup_campaigns#toggle_unsubscribe
#                               admin_soup_campaigns GET    /admin/soup_campaigns(.:format)                                                               admin/soup_campaigns#index
#                                                    POST   /admin/soup_campaigns(.:format)                                                               admin/soup_campaigns#create
#                            new_admin_soup_campaign GET    /admin/soup_campaigns/new(.:format)                                                           admin/soup_campaigns#new
#                           edit_admin_soup_campaign GET    /admin/soup_campaigns/:id/edit(.:format)                                                      admin/soup_campaigns#edit
#                                admin_soup_campaign GET    /admin/soup_campaigns/:id(.:format)                                                           admin/soup_campaigns#show
#                                                    PATCH  /admin/soup_campaigns/:id(.:format)                                                           admin/soup_campaigns#update
#                                                    PUT    /admin/soup_campaigns/:id(.:format)                                                           admin/soup_campaigns#update
#                                                    DELETE /admin/soup_campaigns/:id(.:format)                                                           admin/soup_campaigns#destroy
#          batch_fulfill_admin_project_grants_orders POST   /admin/project_grants/orders/batch_fulfill(.:format)                                          admin/project_grants/orders#batch_fulfill
# reconcile_pending_topup_admin_project_grants_order POST   /admin/project_grants/orders/:id/reconcile_pending_topup(.:format)                            admin/project_grants/orders#reconcile_pending_topup
#                        admin_project_grants_orders GET    /admin/project_grants/orders(.:format)                                                        admin/project_grants/orders#index
#                         admin_project_grants_order GET    /admin/project_grants/orders/:id(.:format)                                                    admin/project_grants/orders#show
#                                                    PATCH  /admin/project_grants/orders/:id(.:format)                                                    admin/project_grants/orders#update
#                                                    PUT    /admin/project_grants/orders/:id(.:format)                                                    admin/project_grants/orders#update
#                       admin_project_grants_setting GET    /admin/project_grants/setting(.:format)                                                       admin/project_grants/settings#show
#                                                    PATCH  /admin/project_grants/setting(.:format)                                                       admin/project_grants/settings#update
#                                                    PUT    /admin/project_grants/setting(.:format)                                                       admin/project_grants/settings#update
#               resolve_admin_project_grants_warning POST   /admin/project_grants/warnings/:id/resolve(.:format)                                          admin/project_grants/warnings#resolve
#            ledger_admin_project_grants_adjustments GET    /admin/project_grants/adjustments/ledger(.:format)                                            admin/project_grants/adjustments#ledger
#                   admin_project_grants_adjustments POST   /admin/project_grants/adjustments(.:format)                                                   admin/project_grants/adjustments#create
#                new_admin_project_grants_adjustment GET    /admin/project_grants/adjustments/new(.:format)                                               admin/project_grants/adjustments#new
#                              admin_unified_inspect GET    /admin/unified_inspect/:ship_id/:token(.:format)                                              admin/unified_inspect#show {token: /[a-f0-9]{64}/}
#                                 rails_health_check GET    /up(.:format)                                                                                 rails/health#show
#                                               root GET    /                                                                                             landing#index
#                                             signin GET    /auth/hca/start(.:format)                                                                     auth#new
#                                       hca_callback GET    /auth/hca/callback(.:format)                                                                  auth#create
#                                            signout DELETE /auth/signout(.:format)                                                                       auth#destroy
#                                        lapse_start GET    /auth/lapse/start(.:format)                                                                   lapse_auth#start
#                                     lapse_callback GET    /auth/lapse/callback(.:format)                                                                lapse_auth#callback
#                                        slack_start GET    /auth/slack/start(.:format)                                                                   slack_auth#start
#                                     slack_callback GET    /auth/slack/callback(.:format)                                                                slack_auth#callback
#                                       slack_events POST   /slack/events(.:format)                                                                       slack/events#create
#                                          hcb_start GET    /auth/hcb/start(.:format)                                                                     hcb_auth#start
#                                       hcb_callback GET    /auth/hcb/callback(.:format)                                                                  hcb_auth#callback
#                                     hcb_disconnect DELETE /auth/hcb(.:format)                                                                           hcb_auth#destroy
#                                      trial_session POST   /trial_session(.:format)                                                                      trial_sessions#create
#                                               rsvp POST   /rsvp(.:format)                                                                               rsvps#create
#                                              sorry GET    /sorry(.:format)                                                                              bans#show
#                                         onboarding GET    /onboarding(.:format)                                                                         onboarding#show
#                                                    POST   /onboarding(.:format)                                                                         onboarding#update
#                                               path GET    /path(.:format)                                                                               path#index
#                                     bulletin_board GET    /bulletin_board(.:format)                                                                     bulletin_board#index
#                              bulletin_board_search GET    /bulletin_board/search(.:format)                                                              bulletin_board#search
#                         bulletin_board_events_feed GET    /bulletin_board/events.ics(.:format)                                                          bulletin_board#events_feed {format: "ics"}
#                           bulletin_board_event_ics GET    /bulletin_board/events/:id.ics(.:format)                                                      bulletin_board#event_ics {format: "ics", id: /\d+/}
#                               bulletin_board_event GET    /bulletin_board/events/:id(.:format)                                                          bulletin_board#event
#                            set_slack_photo_profile POST   /profile/set_slack_photo(.:format)                                                            profiles#set_slack_photo
#                              custom_avatar_profile DELETE /profile/custom_avatar(.:format)                                                              profiles#custom_avatar
#                                            profile GET    /profile(.:format)                                                                            profiles#show
#                                                    PATCH  /profile(.:format)                                                                            profiles#update
#                                                    PUT    /profile(.:format)                                                                            profiles#update
#                                        streak_goal GET    /streak_goal(.:format)                                                                        streak_goals#show
#                                                    DELETE /streak_goal(.:format)                                                                        streak_goals#destroy
#                                                    POST   /streak_goal(.:format)                                                                        streak_goals#create
#                           new_professor_enrollment GET    /professor_enrollment/new(.:format)                                                           professor_enrollments#new
#                               professor_enrollment POST   /professor_enrollment(.:format)                                                               professor_enrollments#create
#                          mark_seen_dialog_campaign POST   /dialog_campaigns/:key/mark_seen(.:format)                                                    dialog_campaigns#mark_seen
#                                        summit_rsvp PATCH  /profile/summit_rsvp(.:format)                                                                profiles#summit_rsvp
#                                            critter GET    /spin/:id(.:format)                                                                           critters#show
#                                                    PATCH  /spin/:id(.:format)                                                                           critters#update
#                                                    PUT    /spin/:id(.:format)                                                                           critters#update
#                                           clearing GET    /clearing(.:format)                                                                           clearing#index
#                                       dismiss_mail POST   /mails/:id/dismiss(.:format)                                                                  mails#dismiss
#                                     read_all_mails POST   /mails/read_all(.:format)                                                                     mails#read_all
#                                              mails GET    /mails(.:format)                                                                              mails#index
#                                               mail GET    /mails/:id(.:format)                                                                          mails#show
#                                onboarding_projects GET    /projects/onboarding(.:format)                                                                projects#onboarding
#                             export_journal_project GET    /projects/:id/export_journal(.:format)                                                        projects#export_journal
#                              refresh_cover_project POST   /projects/:id/refresh_cover(.:format)                                                         projects#refresh_cover
#                               cover_status_project GET    /projects/:id/cover_status(.:format)                                                          projects#cover_status
#                            project_journal_entries POST   /projects/:project_id/journal_entries(.:format)                                               journal_entries#create
#                          new_project_journal_entry GET    /projects/:project_id/journal_entries/new(.:format)                                           journal_entries#new
#                      project_collaboration_invites POST   /projects/:project_id/collaboration_invites(.:format)                                         projects/collaboration_invites#create
#                       project_collaboration_invite DELETE /projects/:project_id/collaboration_invites/:id(.:format)                                     projects/collaboration_invites#destroy
#                                       project_ship GET    /projects/:project_id/ship(.:format)                                                          projects/ships#preflight
#                            preflight_project_ships GET    /projects/:project_id/ships/preflight(.:format)                                               projects/ships#preflight
#                        preflight_run_project_ships POST   /projects/:project_id/ships/preflight/run(.:format)                                           projects/ships#run
#                     preflight_status_project_ships GET    /projects/:project_id/ships/preflight/status(.:format)                                        projects/ships#status
#                                      project_ships POST   /projects/:project_id/ships(.:format)                                                         projects/ships#create
#                                           projects GET    /projects(.:format)                                                                           projects#index
#                                                    POST   /projects(.:format)                                                                           projects#create
#                                        new_project GET    /projects/new(.:format)                                                                       projects#new
#                                       edit_project GET    /projects/:id/edit(.:format)                                                                  projects#edit
#                                            project GET    /projects/:id(.:format)                                                                       projects#show
#                                                    PATCH  /projects/:id(.:format)                                                                       projects#update
#                                                    PUT    /projects/:id(.:format)                                                                       projects#update
#                                                    DELETE /projects/:id(.:format)                                                                       projects#destroy
#                        accept_collaboration_invite POST   /collaboration_invites/:id/accept(.:format)                                                   collaboration_invites#accept
#                       decline_collaboration_invite POST   /collaboration_invites/:id/decline(.:format)                                                  collaboration_invites#decline
#                               collaboration_invite GET    /collaboration_invites/:id(.:format)                                                          collaboration_invites#show
#                                     pending_invite GET    /i/:token(.:format)                                                                           pending_collaboration_invites#show
#                                  new_journal_entry GET    /journal_entries/new(.:format)                                                                journal_entries#new
#                       switch_project_journal_entry PATCH  /journal_entries/:id/switch_project(.:format)                                                 journal_entries#switch_project
#                                      journal_entry DELETE /journal_entries/:id(.:format)                                                                journal_entries#destroy
#                              preview_journal_entry POST   /journal_entries/preview(.:format)                                                            journal_entries#preview
#                              lookup_you_tube_video POST   /you_tube_videos/lookup(.:format)                                                             you_tube_videos#lookup
#                            record_lookout_sessions GET    /lookout_sessions/record(.:format)                                                            lookout_sessions#record
#                                new_lookout_session GET    /lookout_sessions/new(.:format)                                                               lookout_sessions#new
#                                       claim_ticket GET    /claim-ticket(.:format)                                                                       ticket_claims#new
#                                                    POST   /claim-ticket(.:format)                                                                       ticket_claims#create
#                                     my_shop_orders GET    /orders(.:format)                                                                             shop_orders#index
#                              shop_item_shop_orders POST   /shop/:shop_item_id/orders(.:format)                                                          shop_orders#create
#                           new_shop_item_shop_order GET    /shop/:shop_item_id/orders/new(.:format)                                                      shop_orders#new
#                               shop_item_shop_order GET    /shop/:shop_item_id/orders/:id(.:format)                                                      shop_orders#show
#                                         shop_items GET    /shop(.:format)                                                                               shop_items#index
#                                          shop_item GET    /shop/:id(.:format)                                                                           shop_items#show
#                                     project_grants GET    /project_grants(.:format)                                                                     project_grants#index
#                                                    POST   /project_grants(.:format)                                                                     project_grants#create
#                                  new_project_grant GET    /project_grants/new(.:format)                                                                 project_grants#new
#                                            top_ups GET    /top_ups(.:format)                                                                            top_ups#index
#                                                    POST   /top_ups(.:format)                                                                            top_ups#create
#                                         new_top_up GET    /top_ups/new(.:format)                                                                        top_ups#new
#                                             infill GET    /infill(.:format)                                                                             tracking_redirects#show {slug: "infill"}
#                                              rmrrf GET    /rmrrf(.:format)                                                                              tracking_redirects#show {slug: "rmrrf"}
#                                        infill_2026 GET    /infill-2026(.:format)                                                                        tracking_redirects#show {slug: "infill-2026"}
#                                         rmrrf_2026 GET    /rmrrf-2026(.:format)                                                                         tracking_redirects#show {slug: "rmrrf-2026"}
#                                                faq GET    /faq(.:format)                                                                                redirect(301, /docs/faq)
#                          soup_campaign_unsubscribe GET    /unsubscribe/soup/:token(.:format)                                                            soup_campaign_unsubscribes#show
#                                                    POST   /unsubscribe/soup/:token(.:format)                                                            soup_campaign_unsubscribes#create
#                                               info GET    /info(.:format)                                                                               redirect(301, /docs)
#                                              about GET    /about(.:format)                                                                              redirect(301, /docs)
#                                               docs GET    /docs(.:format)                                                                               markdown#show
#                                                doc GET    /docs/*slug(.:format)                                                                         markdown#show
#                                    api_v1_projects GET    /api/v1/projects(.:format)                                                                    api/v1/projects#index
#                                     api_v1_project GET    /api/v1/projects/:id(.:format)                                                                api/v1/projects#show
#                                       api_v1_users GET    /api/v1/users(.:format)                                                                       api/v1/users#index
#                                        api_v1_user GET    /api/v1/users/:id(.:format)                                                                   api/v1/users#show
#                            api_v1_explore_projects GET    /api/v1/explore/projects(.:format)                                                            api/v1/explore#projects
#                            api_v1_explore_journals GET    /api/v1/explore/journals(.:format)                                                            api/v1/explore#journals
#                                  rails_performance        /admin/performance                                                                            RailsPerformance::Engine
#                   turbo_recede_historical_location GET    /recede_historical_location(.:format)                                                         turbo/native/navigation#recede
#                   turbo_resume_historical_location GET    /resume_historical_location(.:format)                                                         turbo/native/navigation#resume
#                  turbo_refresh_historical_location GET    /refresh_historical_location(.:format)                                                        turbo/native/navigation#refresh
#                      rails_postmark_inbound_emails POST   /rails/action_mailbox/postmark/inbound_emails(.:format)                                       action_mailbox/ingresses/postmark/inbound_emails#create
#                         rails_relay_inbound_emails POST   /rails/action_mailbox/relay/inbound_emails(.:format)                                          action_mailbox/ingresses/relay/inbound_emails#create
#                      rails_sendgrid_inbound_emails POST   /rails/action_mailbox/sendgrid/inbound_emails(.:format)                                       action_mailbox/ingresses/sendgrid/inbound_emails#create
#                rails_mandrill_inbound_health_check GET    /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#health_check
#                      rails_mandrill_inbound_emails POST   /rails/action_mailbox/mandrill/inbound_emails(.:format)                                       action_mailbox/ingresses/mandrill/inbound_emails#create
#                       rails_mailgun_inbound_emails POST   /rails/action_mailbox/mailgun/inbound_emails/mime(.:format)                                   action_mailbox/ingresses/mailgun/inbound_emails#create
#                     rails_conductor_inbound_emails GET    /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#index
#                                                    POST   /rails/conductor/action_mailbox/inbound_emails(.:format)                                      rails/conductor/action_mailbox/inbound_emails#create
#                  new_rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/new(.:format)                                  rails/conductor/action_mailbox/inbound_emails#new
#                      rails_conductor_inbound_email GET    /rails/conductor/action_mailbox/inbound_emails/:id(.:format)                                  rails/conductor/action_mailbox/inbound_emails#show
#           new_rails_conductor_inbound_email_source GET    /rails/conductor/action_mailbox/inbound_emails/sources/new(.:format)                          rails/conductor/action_mailbox/inbound_emails/sources#new
#              rails_conductor_inbound_email_sources POST   /rails/conductor/action_mailbox/inbound_emails/sources(.:format)                              rails/conductor/action_mailbox/inbound_emails/sources#create
#              rails_conductor_inbound_email_reroute POST   /rails/conductor/action_mailbox/:inbound_email_id/reroute(.:format)                           rails/conductor/action_mailbox/reroutes#create
#           rails_conductor_inbound_email_incinerate POST   /rails/conductor/action_mailbox/:inbound_email_id/incinerate(.:format)                        rails/conductor/action_mailbox/incinerates#create
#                                 rails_service_blob GET    /user-attachments/blobs/redirect/:signed_id/*filename(.:format)                               active_storage/blobs/redirect#show
#                           rails_service_blob_proxy GET    /user-attachments/blobs/proxy/:signed_id/*filename(.:format)                                  active_storage/blobs/proxy#show
#                                                    GET    /user-attachments/blobs/:signed_id/*filename(.:format)                                        active_storage/blobs/redirect#show
#                          rails_blob_representation GET    /user-attachments/representations/redirect/:signed_blob_id/:variation_key/*filename(.:format) active_storage/representations/redirect#show
#                    rails_blob_representation_proxy GET    /user-attachments/representations/proxy/:signed_blob_id/:variation_key/*filename(.:format)    active_storage/representations/proxy#show
#                                                    GET    /user-attachments/representations/:signed_blob_id/:variation_key/*filename(.:format)          active_storage/representations/redirect#show
#                                 rails_disk_service GET    /user-attachments/disk/:encoded_key/*filename(.:format)                                       active_storage/disk#show
#                          update_rails_disk_service PUT    /user-attachments/disk/:encoded_token(.:format)                                               active_storage/disk#update
#                               rails_direct_uploads POST   /user-attachments/direct_uploads(.:format)                                                    active_storage/direct_uploads#create
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
#
# Routes for RailsPerformance::Engine:
#                        Prefix Verb URI Pattern             Controller#Action
#                  engine_asset GET  /assets/*file(.:format) Inline handler (Proc/Lambda)
#             rails_performance GET  /                       rails_performance/rails_performance#index
#    rails_performance_requests GET  /requests(.:format)     rails_performance/rails_performance#requests
#     rails_performance_crashes GET  /crashes(.:format)      rails_performance/rails_performance#crashes
#      rails_performance_recent GET  /recent(.:format)       rails_performance/rails_performance#recent
#        rails_performance_slow GET  /slow(.:format)         rails_performance/rails_performance#slow
#       rails_performance_trace GET  /trace/:id(.:format)    rails_performance/rails_performance#trace
#     rails_performance_summary GET  /summary(.:format)      rails_performance/rails_performance#summary
#     rails_performance_sidekiq GET  /sidekiq(.:format)      rails_performance/rails_performance#sidekiq
# rails_performance_delayed_job GET  /delayed_job(.:format)  rails_performance/rails_performance#delayed_job
#       rails_performance_grape GET  /grape(.:format)        rails_performance/rails_performance#grape
#        rails_performance_rake GET  /rake(.:format)         rails_performance/rails_performance#rake
#      rails_performance_custom GET  /custom(.:format)       rails_performance/rails_performance#custom
#   rails_performance_resources GET  /resources(.:format)    rails_performance/rails_performance#resources

Rails.application.routes.draw do
  # Redirect to localhost from 127.0.0.1 to use same IP address with Vite server
  constraints(host: "127.0.0.1") do
    get "(*path)", to: redirect { |params, req| "#{req.protocol}localhost:#{req.port}/#{params[:path]}" }
  end

  # Dev-only UI sandbox for iterating on RepoDiffCard with mock data
  get "dev/repo_diff_preview", to: "dev/repo_diff_preview#show" if Rails.env.development?
  constraints Constraints::StaffConstraint.new do
    namespace :admin do
      get "dashboard/requirements_design" => "dashboard#requirements_design", as: :requirements_design_dashboard
      get "dashboard/ta_stats" => "dashboard#ta_stats", as: :ta_stats_dashboard
      get "dashboard/dev" => "dashboard#dev", as: :dev_dashboard
      get "/" => "dashboard#index", as: :root

      resources :reviewers, only: [ :show ] do
        resources :reviewer_admin_notes, only: [ :create, :update, :destroy ], path: "notes"
        resources :reviewer_unavailabilities, only: [ :create, :destroy ], path: "unavailabilities"
        resources :reviewer_week_resolutions, only: [ :create, :destroy ], path: "week_resolutions" do
          collection { post :bulk, action: :bulk_create }
        end
      end

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
          end
          collection { get :next }
        end
        resources :design_reviews, only: [ :index, :show, :update ] do
          member do
            post :heartbeat
            post :swap_type
          end
          collection { get :next }
        end
        resources :build_reviews, only: [ :index, :show, :update ] do
          member do
            post :heartbeat
            post :swap_type
          end
          collection { get :next }
        end
        get  "mine",          to: "my_reviews#show",  as: :mine
        get  "mine/:user_id", to: "my_reviews#show",  as: :user_reviews
      end

      resources :project_flags, only: [ :index, :create, :destroy ]

      resources :projects, only: [ :index, :show ] do
        resources :reviewer_notes, only: [ :create, :update, :destroy ]
      end
      resources :users, only: [ :index, :show ]

      resources :ships, only: [ :index, :show ], path: "reviews"

      # Staff-readable index; controller enforces admin-only for mutations.
      resources :bulletin_events, only: [ :index, :create, :update, :destroy ] do
        collection do
          delete :bulk_destroy
          delete :destroy_expired
        end

        member do
          patch :start_now
          patch :force_start_now
          patch :end_now
        end
      end

      # Staff-readable index; controller enforces admin-only for mutations.
      resources :featured_projects, only: [ :index, :create, :destroy ] do
        collection do
          get :projects_search
          patch :reorder
        end

        member do
          patch :update_note
          patch :restore
        end
      end
    end
  end

  constraints Constraints::AdminConstraint.new do
    mount MissionControl::Jobs::Engine, at: "/jobs"
    mount Flipper::UI.app(Flipper), at: "/flipper" # Feature flag dashboard — admin-only
    # Engine renders its dashboard with @datasource = nil when Redis isn't configured — only mount when usable
    mount RailsPerformance::Engine, at: "/admin/performance", as: "rails_performance" if ENV["REDIS_URL"].present?

    namespace :admin do
      resources :projects, only: [] do
        member do
          patch :update_manual_seconds # Admin-only manual time override for legacy projects
          patch :toggle_burnout # Admin-only burnout tag toggle — waives recording requirement
          patch :toggle_unlisted # Admin-only: hide/show project from public explore and bulletin board
        end
      end
      resources :users, only: [] do
        member do
          patch :update_roles
          post :impersonate # Admin-only: start an impersonation session as this user
          patch :update_streak_day # Admin streak day status override
          patch :restore_streak_goal # Admin streak goal restore (fills blank/missed days with frozen)
          patch :update_ban # Admin ban/unban — admin-only
          patch :update_ticket_hours_override # Admin per-user ticket hours threshold override
          patch :toggle_reviewer_suggestion # Exclude/include from "Not Yet a Reviewer" list
          patch :toggle_dashboard_exclusion      # Admin-only: hide/show a reviewer in the Total Contributed leaderboard
          patch :toggle_reduced_expectations    # Admin-only: flag a reviewer as having reduced expectations this period
        end
      end
      resources :activity_checks, only: [ :new, :create ]
      resources :hours_stats, only: [ :index ] do
        collection { post :refresh }
      end
      resources :shop_items, only: [ :index, :new, :create, :edit, :update, :destroy ] # Admin shop item management
      resources :shop_orders, only: [ :index, :show, :update ] # Admin order management
      resources :ticket_claims, only: [ :index ] do # Admin event ticket claim review
        member do
          patch :approve
          patch :reject
        end
        collection do
          patch :bulk_approve
          patch :bulk_reject
        end
      end
      resources :koi_transactions, only: [ :index, :new, :create ] do # Admin koi adjustments
        get :users_search, on: :collection # Autocomplete for the adjustment user picker
      end
      resources :you_tube_videos, only: [] do
        member do
          post :refetch # Re-fetch YouTube metadata for videos with missing duration
        end
      end

      # Unlisted admin tooling: process YouTube footage into 60× timelapses for time auditing.
      # Inside AdminConstraint (admin-only) + controller require_admin!. Not in AdminSidebar.
      get  "youtube-timeaudit"             => "youtube_timeaudits#index",         as: :youtube_timeaudits
      get  "youtube-timeaudit/status"      => "youtube_timeaudits#status",        as: :youtube_timeaudits_status
      post "youtube-timeaudit/process_all" => "youtube_timeaudits#process_all",   as: :process_all_youtube_timeaudits
      post "youtube-timeaudit/:id/process" => "youtube_timeaudits#process_video", as: :process_youtube_timeaudit
      resources :soup_campaigns, only: [ :index, :show, :new, :create, :update, :edit, :destroy ] do
        member do
          get :audience_preview
          post :send_campaign
          post :test_send
          post :cancel
          post "recipients/:recipient_id/toggle_unsubscribe", action: :toggle_unsubscribe, as: :toggle_recipient_unsubscribe
        end
      end

      namespace :project_grants do
        # Topups ledger + warnings are both rendered as secondary tables on the
        # orders index page — no separate :topups or :warnings#index route.
        resources :orders, only: [ :index, :show, :update ] do
          collection { post :batch_fulfill }
          member { post :reconcile_pending_topup }
        end
        resource :setting, only: [ :show, :update ] # Singleton HCB grant config
        resources :warnings, only: [] do
          member { post :resolve }
        end
        resources :adjustments, only: [ :new, :create ] do # Manual ledger in/out adjustments (hcb role only)
          collection { get :ledger } # JSON sidecar for live "current → projected" preview on the form
        end
      end
    end
  end

  # Exit an impersonation session. Intentionally OUTSIDE the admin constraint — while
  # impersonating, the effective user is the (non-staff) target, so they'd fail the
  # AdminConstraint. The controller restores the original admin session.
  delete "impersonate", to: "impersonations#destroy", as: :stop_impersonating

  # Read-only inspector linked from YSWS Unified DB rows so external 3rd-party
  # auditors can see the review timeline + reviewer attribution behind a ship's
  # approval. Intentionally OUTSIDE the StaffConstraint block — auditors aren't
  # Fallout staff. Access is gated by an HMAC token in the path (signed by
  # EXTERNAL_API_KEY via UnifiedInspectToken) to prevent ship_id enumeration.
  namespace :admin do
    get "unified_inspect/:ship_id/:token" => "unified_inspect#show",
        constraints: { token: /[a-f0-9]{64}/ }, as: :unified_inspect
  end

  get "up" => "rails/health#show", as: :rails_health_check


  root "landing#index"

  get "auth/hca/start" => "auth#new", as: :signin
  get "auth/hca/callback" => "auth#create", as: :hca_callback
  delete "auth/signout" => "auth#destroy", as: :signout

  get "auth/lapse/start" => "lapse_auth#start", as: :lapse_start
  get "auth/lapse/callback" => "lapse_auth#callback", as: :lapse_callback

  get "auth/slack/start" => "slack_auth#start", as: :slack_start
  get "auth/slack/callback" => "slack_auth#callback", as: :slack_callback
  post "slack/events" => "slack/events#create", as: :slack_events

  get "auth/hcb/start" => "hcb_auth#start", as: :hcb_start
  get "auth/hcb/callback" => "hcb_auth#callback", as: :hcb_callback
  delete "auth/hcb" => "hcb_auth#destroy", as: :hcb_disconnect

  post "trial_session" => "trial_sessions#create", as: :trial_session
  post "rsvp" => "rsvps#create", as: :rsvp

  get "sorry" => "bans#show", as: :sorry

  get "onboarding" => "onboarding#show", as: :onboarding
  post "onboarding" => "onboarding#update"

  get "path" => "path#index", as: :path
  get "bulletin_board" => "bulletin_board#index", as: :bulletin_board
  get "bulletin_board/search" => "bulletin_board#search", as: :bulletin_board_search # JSON endpoint for debounced explore search; stays on the page instead of re-rendering via Inertia
  # ICS endpoints must precede the bare `events/:id` route because that route's implicit
  # `(.:format)` extension would otherwise swallow `.ics` paths.
  get "bulletin_board/events.ics" => "bulletin_board#events_feed", as: :bulletin_board_events_feed, defaults: { format: "ics" }
  get "bulletin_board/events/:id.ics" => "bulletin_board#event_ics", as: :bulletin_board_event_ics, constraints: { id: /\d+/ }, defaults: { format: "ics" }
  get "bulletin_board/events/:id" => "bulletin_board#event", as: :bulletin_board_event

  resource :profile, only: [ :show, :update ] do
    post :set_slack_photo, on: :member
    delete :custom_avatar, on: :member
  end

  resource :streak_goal, only: [ :show, :create, :destroy ]

  # Self-enrollment to the Professor (mentor) Slack channel — singleton because each user
  # has at most one enrollment. `new` renders the confirmation modal page; `create` POSTs
  # to the Professor API and stamps the timestamp.
  resource :professor_enrollment, only: [ :new, :create ]

  # Campaign-based dialog system — marks a one-time dialog as seen via plain fetch (not Inertia)
  post "dialog_campaigns/:key/mark_seen", to: "dialog_campaigns#mark_seen", as: :mark_seen_dialog_campaign

  # Event RSVP — saved from the 60-hours soup dialog
  patch "profile/summit_rsvp", to: "profiles#summit_rsvp", as: :summit_rsvp

  resources :critters, only: [ :show, :update ], path: "spin" # Gacha spin reveal page
  get "clearing" => "clearing#index", as: :clearing

  resources :mails, only: [ :index, :show ], controller: "mails" do
    post :dismiss, on: :member
    post :read_all, on: :collection
  end

  resources :projects do
    get "onboarding", on: :collection # Project onboarding modal accessed from path page
    get :export_journal, on: :member
    post :refresh_cover, on: :member # Owner-triggered zine cover re-check (then polled via cover_status)
    get :cover_status, on: :member # Polled by the frontend for cover refresh state
    resources :journal_entries, only: [ :new, :create ]
    resources :collaboration_invites, only: [ :create, :destroy ], module: :projects # Send and revoke project collaboration invites
    get :ship, controller: "projects/ships", action: :preflight # /projects/:id/ship — multi-step submission page
    resources :ships, only: [ :create ], module: :projects do
      collection do
        get :preflight # Legacy route — redirects to /projects/:id/ship
        post "preflight/run", action: :run # Frontend kicks off preflight scan
        get "preflight/status", action: :status # Polled by frontend for real-time check updates
        post :reship # Pull the in-review ship out of the queue and submit a fresh one (no preflight)
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
  patch "journal_entries/:id/switch_project" => "journal_entries#switch_project", as: :switch_project_journal_entry
  delete "journal_entries/:id" => "journal_entries#destroy", as: :journal_entry
  post "journal_entries/preview" => "journal_entries#preview", as: :preview_journal_entry
  post "you_tube_videos/lookup" => "you_tube_videos#lookup", as: :lookup_you_tube_video
  resources :lookout_sessions, only: %i[new] do
    get :record, on: :collection # Token-based recording page: /lookout_sessions/record?token=...
  end

  # Event ticket claim — available to users with >= 60 approved hours
  get "claim-ticket" => "ticket_claims#new", as: :claim_ticket
  post "claim-ticket" => "ticket_claims#create"

  get "orders", to: "shop_orders#index", as: :my_shop_orders # Current user's purchase history
  resources :shop_items, path: "shop", only: [ :index, :show ] do # Koi shop (admin CRUD via /admin/shop_items)
    resources :shop_orders, only: [ :new, :create, :show ], path: "orders" # Purchase flow
  end

  # User-facing project funding requests. Admin approval lives under /admin/project_grants/orders.
  resources :project_grants, only: [ :index, :new, :create ]

  # User-funded top-ups via HCB donations. Money lands on the user's active card
  # without consuming koi-funded entitlement (counts_toward_funding: false).
  resources :top_ups, only: [ :index, :new, :create ]

  # Adblocker-safe tracking redirects — sets utm_source on Ahoy visit without query params
  %w[infill rmrrf infill-2026 rmrrf-2026].each do |slug|
    get slug => "tracking_redirects#show", defaults: { slug: slug }
  end

  get "guide" => redirect("https://drive.google.com/file/d/1bY5i5vIA_TjgX5BFAaYK8JP492B3Srdp/view?usp=drive_link") # Participant's guide PDF
  get "faq" => redirect("/docs/faq") # Shortcut to FAQ docs page
  get "unsubscribe/soup/:token" => "soup_campaign_unsubscribes#show", as: :soup_campaign_unsubscribe
  post "unsubscribe/soup/:token" => "soup_campaign_unsubscribes#create"
  get "info" => redirect("/docs")
  get "about" => redirect("/docs")
  get "docs" => "markdown#show", as: :docs
  get "docs/*slug" => "markdown#show", as: :doc

  namespace :api do
    namespace :v1 do
      resources :projects, only: [ :index, :show ]
      resources :users, only: [ :index, :show ], param: :id
      scope :explore do
        get :projects, to: "explore#projects", as: :explore_projects
        get :journals, to: "explore#journals", as: :explore_journals
      end
    end
  end
end
