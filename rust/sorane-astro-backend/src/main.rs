use std::io::Read;

#[cfg(not(target_arch = "wasm32"))]
use sorane_astro_backend::run_backend_json;
#[cfg(not(target_arch = "wasm32"))]
use sorane_astro_backend::search_index_cmd::run_search_index_json;

fn main() {
    let sub = std::env::args().nth(1);
    match sub.as_deref() {
        #[cfg(not(target_arch = "wasm32"))]
        Some("index") => run_index_main(),
        _ => run_backend_main(),
    }
}

fn run_backend_main() {
    #[cfg(target_arch = "wasm32")]
    {
        eprintln!("wasm32 build supports backend JSON only");
        std::process::exit(1);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let mut stdin = String::new();
        if Read::read_to_string(&mut std::io::stdin(), &mut stdin).is_err() {
            eprintln!("failed to read stdin");
            std::process::exit(1);
        }
        match run_backend_json(&stdin) {
            Ok(output) => println!("{output}"),
            Err(err) => {
                eprintln!("{err}");
                std::process::exit(1);
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn run_index_main() {
    let mut stdin = String::new();
    if Read::read_to_string(&mut std::io::stdin(), &mut stdin).is_err() {
        eprintln!("failed to read stdin");
        std::process::exit(1);
    }
    match run_search_index_json(&stdin) {
        Ok(output) => println!("{output}"),
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    }
}