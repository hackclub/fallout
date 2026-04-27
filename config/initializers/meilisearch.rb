MeiliSearch::Rails.configuration = {
  meilisearch_url: ENV.fetch("MEILISEARCH_URL", "http://127.0.0.1:7700"),
  meilisearch_api_key: ENV["MEILISEARCH_API_KEY"]
}
