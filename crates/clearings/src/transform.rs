use crate::contract::{ABI, Prepared, require_source};
use anyhow::{Result, ensure};
use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{TransformOptions, Transformer};
use std::path::Path;

pub fn prepare(source: &str) -> Result<Prepared> {
    require_source(source)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::ts()).parse();
    ensure!(parsed.diagnostics.is_empty(), "TypeScript syntax errors: {:?}", parsed.diagnostics);
    let mut program = parsed.program;
    let semantic = SemanticBuilder::new().build(&program);
    ensure!(semantic.diagnostics.is_empty(), "TypeScript semantic errors: {:?}", semantic.diagnostics);
    let options = TransformOptions::default();
    let transformed = Transformer::new(&allocator, Path::new("routine.ts"), &options)
        .build_with_scoping(semantic.semantic.into_scoping(), &mut program);
    ensure!(transformed.diagnostics.is_empty(), "unsupported TypeScript transform: {:?}", transformed.diagnostics);
    let generated = Codegen::new().with_options(CodegenOptions {
        source_map_path: Some("routine.ts".into()),
        ..CodegenOptions::default()
    }).build(&program);
    Ok(Prepared { abi: ABI, javascript: generated.code, source_map: generated.map.map(|m| m.to_json_string()) })
}

