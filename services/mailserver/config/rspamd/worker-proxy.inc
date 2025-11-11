# Enable proxy worker to accept Postfix milter traffic
enabled = true;
bind_socket = "0.0.0.0:11332";
count = 1;
timeout = 120s;
milter = yes;
upstream "local" {
  default = yes;
  self_scan = yes;
}
