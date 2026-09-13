use clearings::{capabilities::{Broker,LocalBroker},contract::{Contract,Policy,HttpBinding}};
use serde_json::json;
use std::{io::{Read,Write},net::TcpListener,time::Duration};
fn request(response:&str, schema:serde_json::Value)->anyhow::Result<serde_json::Value>{
    let server=TcpListener::bind("127.0.0.1:0")?;let addr=server.local_addr()?;let response=response.to_owned();
    let t=std::thread::spawn(move||{let(mut socket,_)=server.accept().unwrap();let mut b=[0;4096];let n=socket.read(&mut b).unwrap();let req=String::from_utf8_lossy(&b[..n]);assert!(req.starts_with("GET /data?q=hello+world "));socket.write_all(response.as_bytes()).unwrap();});
    let c:Contract=serde_json::from_value(json!({"abi":1,"name":"http","description":"test","input_schema":{},"output_schema":{},"capabilities":["data.get"]}))?;
    let policy=Policy{http:[("data.get".into(),HttpBinding{url:format!("http://{addr}/data"),query_keys:vec!["q".into()],output_schema:schema,bearer_token_env:None})].into(),..Policy::default()};
    let mut broker=LocalBroker::new(&c,&policy)?;
    assert!(broker.call("data.get",json!({"url":"https://elsewhere"}),Duration::from_secs(2)).is_err());
    let result=broker.call("data.get",json!({"q":"hello world"}),Duration::from_secs(2));t.join().unwrap();result
}
#[test]
fn fixed_http_binding_validates_schema_and_does_not_follow_redirects(){
    assert_eq!(request("HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"n\":1}",json!({"type":"object"})).unwrap(),json!({"n":1}));
    assert!(request("HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"n\":1}",json!({"type":"array"})).is_err());
    assert!(request("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",json!({})).is_err());
}
