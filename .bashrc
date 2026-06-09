if [ -f /etc/bashrc ]; then
    . /etc/bashrc
fi

HISTSIZE=1000
HISTFILESIZE=2000

PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

alias ll='ls -laf'
alias ..='cd ..'
