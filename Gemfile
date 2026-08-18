source "https://rubygems.org"

# CocoaPods installs the native iOS dependencies (`ios/App/Pods`). It is only needed on
# a Mac, and only when native dependencies change — `npx cap copy ios` does not touch it,
# `npx cap sync ios` does.
#
# The version is pinned to the one that produced the committed `ios/App/Podfile.lock`,
# so a fresh install cannot silently regenerate it against a newer CocoaPods.
#
# ## Installing it
#
#   gem install --user-install bundler -v 2.4.22   # system Bundler 1.17 cannot resolve this
#   export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
#   export GEM_HOME="$HOME/.gem/ruby/2.6.0"        # ← the one that actually matters
#   export LANG=en_US.UTF-8                        # CocoaPods aborts without a UTF-8 locale
#   bundle install
#
# **`GEM_HOME` is the load-bearing line.** Without it Bundler writes to the system gem
# directory, `/Library/Ruby/Gems/2.6.0`, which is root-owned — every gem with a native
# extension then fails. The failure is badly disguised: Bundler reports
# "An error occurred while installing <gem>, and Bundler cannot continue", names a
# different gem each run depending on install order, and prints the dependency chain that
# pulled it in. All of that points at a version-resolution problem. The actual cause is a
# `Bundler::PermissionError` several lines further up.
#
# That misreading is worth naming because the obvious response — pin the named gem, re-run,
# pin the next one — appears to make progress (each pin does clear that gem) while never
# terminating, since the next gem in install order fails for the same untouched reason.
# With GEM_HOME set, the completely unpinned Gemfile below resolves and builds all 41 gems
# on the stock Ruby 2.6.10 in one pass.
#
# See docs/IOS.md.
gem "cocoapods", "1.17.0"
