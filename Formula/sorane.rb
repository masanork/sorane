class Sorane < Formula
  desc "OKF-native static site generator"
  homepage "https://ssg.sorane.dev"
  url "https://registry.npmjs.org/@sorane/cli/-/cli-0.5.0.tgz"
  sha256 "ea8f4760ff77c0d0876a9393d37a5afe175462b96bd7bab11e8c57f014b1d000"
  license "MIT"

  depends_on "node"

  def install
    # better-sqlite3 needs its install script to fetch or compile the native binding.
    system "npm", "install", *std_npm_args(ignore_scripts: false)
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "usage: sorane", shell_output("#{bin}/sorane 2>&1")
  end
end
