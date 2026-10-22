//! Regenerates the large entry-count fixtures in the top-level `fixtures/`
//! directory.
//!
//! Run from the repository root:
//!
//! ```sh
//! cargo run -p kdbx-core --example generate-fixtures --release
//! ```
//!
//! The generated databases use the same KDF settings as the
//! `test-aes-kdf.kdbx` and `test-argon2d.kdbx` fixtures:
//!
//! - AES-KDF: 300,000 rounds
//! - Argon2d: 64 MiB memory, 65 iterations, parallelism 4
//! - `test-argon2d-10-iterations.kdbx` / `test-argon2d-30-iterations.kdbx`:
//!   same Argon2d settings with 10 and 30 iterations respectively
//!
//! All generated files use the password `123456`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use kdbx_core::core::crypto::generate_random_bytes;
use kdbx_core::core::parser::generate_kdbx;
use kdbx_core::core::types::{
    CompressionAlgorithm, EncryptionAlgorithm, Entry, EntryField, FileVersion, Group, KdbxHeader,
    KdbxSession, KdfAlgorithm, Metadata, SecString,
};

const PASSWORD: &str = "123456";
const ENTRY_COUNTS: [usize; 3] = [300, 1000, 10000];

#[derive(Clone, Copy)]
enum KdfKind {
    AesKdf,
    Argon2d,
}

fn header(kdf: KdfKind) -> KdbxHeader {
    KdbxHeader {
        version: FileVersion::new(4, 1),
        encryption: EncryptionAlgorithm::Aes256,
        compression: CompressionAlgorithm::Gzip,
        kdf: match kdf {
            KdfKind::AesKdf => KdfAlgorithm::AesKdf {
                rounds: 300_000,
                salt: generate_random_bytes(32),
            },
            KdfKind::Argon2d => KdfAlgorithm::Argon2d {
                memory: 64 * 1024 * 1024,
                iterations: 65,
                parallelism: 4,
                salt: generate_random_bytes(32),
            },
        },
        master_seed: generate_random_bytes(32),
        encryption_iv: generate_random_bytes(16),
        transform_seed: None,
        transform_rounds: None,
        stream_start_bytes: None,
        inner_random_stream_key: None,
    }
}

fn session(kdf: KdfKind, entry_count: usize) -> KdbxSession {
    let mut groups = HashMap::new();
    let root = Group::new("Root".to_string(), None);
    let root_id = root.id;
    groups.insert(root.id, root);

    let mut entries = HashMap::new();
    for index in 0..entry_count {
        let mut entry = Entry::new(
            root_id,
            format!("Entry {index:05}"),
            SecString::from_plain(&format!("password-{index:05}")),
        );
        entry.fields.insert(
            "UserName".into(),
            EntryField::new(format!("user{index:05}"), false),
        );
        entry
            .fields
            .insert("URL".into(), EntryField::new("https://example.com", false));
        entry.fields.insert(
            "Notes".into(),
            EntryField::new(format!("Generated fixture entry #{index}"), false),
        );
        entries.insert(entry.id, entry);
    }

    let mut session = KdbxSession {
        header: header(kdf),
        groups,
        entries,
        deleted_objects: vec![],
        metadata: Metadata {
            database_name: Some(format!("fixture-{entry_count}")),
            ..Metadata::default()
        },
        root_group: Some(root_id),
        group_children: HashMap::new(),
        group_entries: HashMap::new(),
        attachments: vec![],
    };
    session.rebuild_indexes();
    session
}

fn write_fixture(fixtures_dir: &Path, name: &str, session: &KdbxSession) {
    let data = generate_kdbx(session, Some(PASSWORD), None).expect("failed to generate fixture");
    let path = fixtures_dir.join(name);
    std::fs::write(&path, data).expect("failed to write fixture");
    println!(
        "wrote {} entries to {}",
        session.entries.len(),
        path.display()
    );
}

fn main() {
    let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");

    for entry_count in ENTRY_COUNTS {
        for (suffix, kdf) in [("aes-kdf", KdfKind::AesKdf), ("argon2d", KdfKind::Argon2d)] {
            write_fixture(
                &fixtures_dir,
                &format!("entries-{entry_count}-{suffix}.kdbx"),
                &session(kdf, entry_count),
            );
        }
    }

    // Same 5-entry database with reduced Argon2d iteration counts. Useful for
    // isolating the Argon2d iteration cost against `test-argon2d.kdbx` (65).
    for iterations in [10u64, 30] {
        let mut session = session(KdfKind::Argon2d, 5);
        if let KdfAlgorithm::Argon2d {
            iterations: configured,
            ..
        } = &mut session.header.kdf
        {
            *configured = iterations;
        }
        write_fixture(
            &fixtures_dir,
            &format!("test-argon2d-{iterations}-iterations.kdbx"),
            &session,
        );
    }
}
