require "test_helper"

class MarkdownHelperTest < ActionView::TestCase
  include MarkdownHelper

  test "protocol-relative image src is replaced with external-image callout" do
    html = render_user_markdown("![x](//example.com/img.png)")

    assert_no_match %r{<img[^>]*src=["']//example\.com/img\.png["']}, html
    assert_includes html, "external-image-callout"
    assert_includes html, "//example.com/img.png"
  end
end
