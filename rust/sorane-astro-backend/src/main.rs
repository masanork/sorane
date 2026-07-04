use sorane_astro_backend::run_backend_json;
use std::io::Read;

fn main() {
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