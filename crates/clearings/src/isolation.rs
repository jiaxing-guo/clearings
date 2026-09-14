use anyhow::Result;

pub fn enter() -> Result<()> {
    #[cfg(unix)]
    unsafe {
        // Hard limits apply to the entire unprivileged worker, including Rust and C allocations.
        let memory = libc::rlimit {
            rlim_cur: 512 * 1024 * 1024,
            rlim_max: 512 * 1024 * 1024,
        };
        #[cfg(target_os = "linux")]
        if libc::setrlimit(libc::RLIMIT_AS, &memory) != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        #[cfg(not(target_os = "linux"))]
        let _ = memory;
        let cpu = libc::rlimit {
            rlim_cur: 60,
            rlim_max: 60,
        };
        let core = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        if libc::setrlimit(libc::RLIMIT_CPU, &cpu) != 0
            || libc::setrlimit(libc::RLIMIT_CORE, &core) != 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    platform()
}

#[cfg(all(
    target_os = "linux",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
fn platform() -> Result<()> {
    // Allow only computation, clocks, existing descriptors, signals and process exit.
    // There is no open, socket, connect, exec, clone, ptrace, io_uring or filesystem mutation.
    let allowed = [
        libc::SYS_read,
        libc::SYS_write,
        libc::SYS_close,
        libc::SYS_fstat,
        libc::SYS_lseek,
        libc::SYS_fcntl,
        libc::SYS_brk,
        libc::SYS_mmap,
        libc::SYS_munmap,
        libc::SYS_mprotect,
        libc::SYS_mremap,
        libc::SYS_madvise,
        libc::SYS_futex,
        libc::SYS_clock_gettime,
        libc::SYS_gettimeofday,
        libc::SYS_rt_sigaction,
        libc::SYS_rt_sigprocmask,
        libc::SYS_rt_sigreturn,
        libc::SYS_sigaltstack,
        libc::SYS_getpid,
        libc::SYS_gettid,
        libc::SYS_getrandom,
        libc::SYS_sched_yield,
        libc::SYS_restart_syscall,
        libc::SYS_exit,
        libc::SYS_exit_group,
    ];
    #[cfg(target_arch = "x86_64")]
    let architecture = 0xc000003e;
    #[cfg(target_arch = "aarch64")]
    let architecture = 0xc00000b7;
    let stmt = |code, k| libc::sock_filter {
        code,
        jt: 0,
        jf: 0,
        k,
    };
    let jump = |k, jt, jf| libc::sock_filter {
        code: 0x15,
        jt,
        jf,
        k,
    };
    let mut filter = vec![
        stmt(0x20, 4),
        jump(architecture, 1, 0),
        stmt(0x06, 0x80000000),
        stmt(0x20, 0),
    ];
    for syscall in allowed {
        filter.push(jump(syscall as u32, 0, 1));
        filter.push(stmt(0x06, 0x7fff0000));
    }
    filter.push(stmt(0x06, 0x00050000 | libc::EACCES as u32));
    let program = libc::sock_fprog {
        len: filter.len() as u16,
        filter: filter.as_mut_ptr(),
    };
    unsafe {
        if libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_SECCOMP, 2, &program) != 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn platform() -> Result<()> {
    use std::ffi::{CStr, CString};
    unsafe extern "C" {
        fn sandbox_init(
            profile: *const libc::c_char,
            flags: u64,
            error: *mut *mut libc::c_char,
        ) -> libc::c_int;
        fn sandbox_free_error(error: *mut libc::c_char);
    }
    // Enter after loading the executable; guest code needs no new files or sockets.
    let profile = CString::new(
        "(version 1)(deny default)(allow signal (target self))(allow sysctl-read)(allow file-read* file-write* (literal \"/dev/null\"))",
    )?;
    let mut error = std::ptr::null_mut();
    if unsafe { sandbox_init(profile.as_ptr(), 0, &mut error) } != 0 {
        let message = if error.is_null() {
            "sandbox initialization failed".into()
        } else {
            let message = unsafe { CStr::from_ptr(error) }
                .to_string_lossy()
                .into_owned();
            unsafe { sandbox_free_error(error) };
            message
        };
        anyhow::bail!("{message}");
    }
    Ok(())
}

#[cfg(not(any(
    target_os = "macos",
    all(
        target_os = "linux",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )
)))]
fn platform() -> Result<()> {
    anyhow::bail!("OS isolation is not implemented on this platform")
}
