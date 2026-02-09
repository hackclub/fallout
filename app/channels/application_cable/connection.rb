module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user || reject_unauthorized_connection
    end

    private

    def find_verified_user
      if user_id = cookies.signed[:user_id]
        User.find_by(id: user_id)
      end
    end
  end
end
