class Api::V1::Accounts::ArticlesController < Api::V1::Accounts::BaseController
  before_action :portal
  before_action :check_authorization
  before_action :fetch_article, except: [:index, :create, :reorder]
  before_action :set_current_page, only: [:index]
  before_action :validate_author, only: [:create]
  before_action :discard_invalid_author, only: [:update]

  def index
    @portal_articles = @portal.articles

    set_article_count

    @articles = @articles.search(list_params)

    @articles = if list_params[:category_slug].present?
                  @articles.order_by_position.page(@current_page)
                else
                  @articles.order_by_updated_at.page(@current_page)
                end
  end

  def show; end
  def edit; end

  def create
    params_with_defaults = article_params
    params_with_defaults[:status] ||= :draft
    @article = @portal.articles.create!(params_with_defaults)
    @article.associate_root_article(article_params[:associated_article_id])
    render json: { error: @article.errors.messages }, status: :unprocessable_entity and return unless @article.valid?
  end

  def update
    @article.update!(article_params) if params[:article].present?
    render json: { error: @article.errors.messages }, status: :unprocessable_entity and return unless @article.valid?
  end

  def destroy
    @article.destroy!
    head :ok
  end

  def reorder
    Article.update_positions(params[:positions_hash])
    head :ok
  end

  private

  def set_article_count
    # Search the params without status and author_id, use this to
    # compute mine count published draft etc
    base_search_params = list_params.except(:status, :author_id)
    @articles = @portal_articles.search(base_search_params)

    @articles_count = @articles.count
    @mine_articles_count = @articles.search_by_author(Current.user.id).count
    @published_articles_count = @articles.published.count
    @draft_articles_count = @articles.draft.count
    @archived_articles_count = @articles.archived.count
  end

  def fetch_article
    @article = @portal.articles.find(params[:id])
  end

  def validate_author
    author_id = params.dig(:article, :author_id)
    return if author_id.blank?
    return if author_belongs_to_account?(author_id)

    render json: { error: 'Invalid author ID' }, status: :unprocessable_entity
  end

  def discard_invalid_author
    submitted_article_params = params[:article]
    return unless submitted_article_params&.key?(:author_id)

    author_id = submitted_article_params[:author_id]
    return if author_belongs_to_account?(author_id)

    submitted_article_params.delete(:author_id)
  end

  def author_belongs_to_account?(author_id)
    author_id.to_s.match?(/\A\d+\z/) && Current.account.users.exists?(id: author_id.to_i)
  end

  def portal
    @portal ||= Current.account.portals.find_by!(slug: params[:portal_id])
  end

  def article_params
    params.require(:article).permit(
      :title, :slug, :position, :content, :description, :category_id, :author_id, :associated_article_id, :status,
      :locale, meta: [:title,
                      :description,
                      { tags: [] }]
    )
  end

  def list_params
    params.permit(:locale, :query, :page, :category_slug, :status, :author_id)
  end

  def set_current_page
    @current_page = params[:page] || 1
  end
end
