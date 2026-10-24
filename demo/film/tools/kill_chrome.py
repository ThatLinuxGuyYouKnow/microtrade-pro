import os, signal
me = os.getpid()
killed = []
for pid in filter(str.isdigit, os.listdir('/proc')):
    try:
        with open(f'/proc/{pid}/cmdline', 'rb') as f:
            cmd = f.read().replace(b'\0', b' ').decode('utf-8', 'replace')
    except Exception:
        continue
    if 'chrome-headless-shell' in cmd and int(pid) != me:
        try:
            os.kill(int(pid), signal.SIGTERM)
            killed.append((pid, cmd[:100]))
        except Exception as e:
            print('fail', pid, e)
print('killed:', killed)
