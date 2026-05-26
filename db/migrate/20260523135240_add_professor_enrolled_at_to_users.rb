class AddProfessorEnrolledAtToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :professor_enrolled_at, :datetime
  end
end
