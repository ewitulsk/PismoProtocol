
            /// Returns the `rustc` SemVer version and additional metadata
            /// like the git short hash and build date.
            pub fn version_meta() -> VersionMeta {
                VersionMeta {
                    semver: Version {
                        major: 1,
                        minor: 88,
                        patch: 0,
                        pre: Prerelease::new("").unwrap(),
                        build: BuildMetadata::new("").unwrap(),
                    },
                    host: "x86_64-unknown-linux-gnu".to_owned(),
                    short_version_string: "rustc 1.88.0 (6b00bc388 2025-06-23)".to_owned(),
                    commit_hash: Some("6b00bc3880198600130e1cf62b8f8a93494488cc".to_owned()),
                    commit_date: Some("2025-06-23".to_owned()),
                    build_date: None,
                    channel: Channel::Stable,
                    llvm_version: Some(LlvmVersion{ major: 20, minor: 1 }),
                }
            }
            