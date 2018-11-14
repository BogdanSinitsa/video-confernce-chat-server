Set up
==============

- config port redirect to port 843:
    - Ubuntu
        >sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 843 -j REDIRECT --to-port 3843
    - CentOs
        >sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 843 -j DNAT --to-destination :3843
        >sudo iptables -I INPUT -p tcp -m tcp --dport 843 -j ACCEPT
        >sudo iptables -I INPUT -p tcp -m tcp --dport 3843 -j ACCEPT
- Run via: pm2 or forever