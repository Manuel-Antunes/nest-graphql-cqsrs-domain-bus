require 'rails_helper'

RSpec.describe ContactLink, type: :model do
  describe 'associations' do
    it { is_expected.to belong_to(:contact) }
  end

  describe 'validations' do
    subject { create(:contact_link) }

    it { is_expected.to validate_uniqueness_of(:contact_id) }
  end
end
