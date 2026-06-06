class AddTicketHoursOverrideToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :ticket_hours_override, :integer
  end
end
