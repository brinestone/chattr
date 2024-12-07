import re
from os import path
from os import environ
from pathlib import Path
from platform import system
import argparse
from copy import deepcopy
import subprocess
import random

def uniqueCode(len=0):
    ALPHABET=list('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    ans = ''
    for _ in range(len):
        ans = ans + random.choice(ALPHABET)
    return ans

prefsFile=path.join('/tmp/chattr' if system() != 'Windows' else path.join(environ['TEMP'], 'chattr'), 'state')
homedir=environ['HOME'] if system() != "Windows" else environ['USERPROFILE']
verbose=False
isFirstTime=True
forceMode=True # TODO: set to False in production
state={}
version='1.0'

DROPDIR_KEY_NAME="dropdir"
ANNOUNCED_IP_KEY_NAME="ip"
TRANSPORT_PROTOCOL="transport-protocol"
SESSION_KEY_KEY_NAME="session_key"
API_PORT="api-port"
SERVER_PORT="frontend-port"
ADVANCED_OPTIONS='advanced-options'
RTC_PORT_RANGE='rtc-min-port'
RTC_MIN='rtc-min'
RTC_MAX='rtc-max'
DB_USER='db-user'
DB_PWD='db-pwd'
INIT_DB_CONTAINER_SCRIPT_PATH='init-script-dir'
NGINX_CONFIG_PATH='nginx-config-path'
WEB_DOMAIN='web-domain'


prompts = {
    WEB_DOMAIN:'What domain do you want to use?',
    DROPDIR_KEY_NAME: "Where do you want to place the docker compose file?",
    ANNOUNCED_IP_KEY_NAME: 'What IP address do you want to use?',
    SESSION_KEY_KEY_NAME: 'Session Key?',
    TRANSPORT_PROTOCOL: 'What transport protocol do you want to use for streaming?',
    API_PORT: 'What port would you like to use for the API?',
    SERVER_PORT:'What port do you want to use?',
    ADVANCED_OPTIONS: 'Do you want to see the advanced options?',
    RTC_PORT_RANGE: 'Enter the port range for streaming <min-port>-<max-port>',
    DB_USER: 'Enter the database username',
    DB_PWD:'Enter the database password'
}

defaultState={
    DROPDIR_KEY_NAME: path.join(homedir, '.chattr'),
    SESSION_KEY_KEY_NAME: uniqueCode(len=20),
    TRANSPORT_PROTOCOL:'udp',
    ANNOUNCED_IP_KEY_NAME: '127.0.0.1',
    API_PORT: '3001',
    SERVER_PORT: '3000',
    RTC_PORT_RANGE: '40000-50000',
    DB_PWD: 'chattr',
    DB_USER: 'chattr',
    WEB_DOMAIN:'localhost'
}

statePromptOptions={
    TRANSPORT_PROTOCOL:{'udp':'UDP','tcp':'TCP'},
    ADVANCED_OPTIONS:{True:'Yes',False:'No'}
}

state = deepcopy(defaultState)

def isStateDefault():
    ans = len(defaultState.values()) == len(state.values())
    if ans:
        vals = list(dict(defaultState).values())
        for i,v in enumerate(state.values()):
            if vals[i] != v:
                ans = False
                break

    return ans

def writeState():
    try:
        with open(prefsFile, "w") as f:
            for k,v in state.items():
                f.write(f'{k}={v}\n')
    except FileNotFoundError:
        dir = Path(path.dirname(prefsFile))
        dir.mkdir(parents=True, exist_ok=True)
        return writeState()
    except IOError as e:
        print(e)
        exit(2)

def loadState():
    global state
    global isFirstTime
    try:
        with open(prefsFile, "r") as f:
            for line in f:
                k,v = line.split('=')[0], line.split('=')[1].rstrip()
                if v == 'None':
                    state[k]=None
                else:
                    state[k]=v
            isFirstTime=False
    except IOError:
        isFirstTime = True
        return

def parseArgs():
    parser = argparse.ArgumentParser(
        prog='Chattr Installer',
        description='CLI installer for Chattr'
    )
    parser.add_argument('-v','--verbose', action="store_true")
    parser.add_argument('-f', '--force', action="store_true")
    args = parser.parse_args()

    global verbose
    global forceMode
    forceMode = args.force
    verbose = args.verbose

def collectOption(Prompt, Default=None, Ordinal=None, Options=None, Validator=lambda val : None):
    ordinal = (str(Ordinal) + '.') if Ordinal != None else ''
    defV = '' if Default == None else str(Default)
    question = f'{ordinal} {Prompt} [{defV}]:'.lstrip(' ')
    valid = False
    if Options != None:
        optionsStr = ''
        i = 1
        for _,v in dict(Options).items():
            optionsStr += f'[{i}] {v}\n'
            i=i+1
        response = str(1)
        question = f'{ordinal} {Prompt} [{response}]:'.lstrip(' ')
        while not valid:
            response = input(f'{question}\n{optionsStr}')
            if response == '':
                valid = True
                response = str(1)
                break
            else:
                try:
                    if not re.fullmatch(r'^\d+$', response):
                        print(red('Invalid input. Try that again.'))
                        continue

                    temp = Options[list(dict(Options).keys())[int(response)-1]]
                    if (int(response) > len(dict(Options).items()) and int(response) < len(dict(Options).items())) or Validator(temp) != None:
                        print(red('Invalid option. Try that again.'))
                    else:
                        valid = True
                except IndexError:
                    print(red('Invalid option. Try that again.'))
        value = list(Options.keys())[int(response)-1]
        return value
    else:
        while not valid:
            value = input(question)
            if len(value) == 0:
                return Default
            else:
                v = Validator(value)
                if v != None:
                    print(red(f'{str(v)}. Try again'))
                    continue
                return value

def collectOptions():
    global state
    qc = 1
    state[DROPDIR_KEY_NAME] = collectOption(prompts[DROPDIR_KEY_NAME], state.get(DROPDIR_KEY_NAME, None), qc, statePromptOptions.get(DROPDIR_KEY_NAME, None))

    qc = qc + 1
    state[WEB_DOMAIN] = collectOption(prompts[WEB_DOMAIN], state.get(WEB_DOMAIN, None), qc, statePromptOptions.get(WEB_DOMAIN, None))

    state[ADVANCED_OPTIONS]=collectOption(prompts[ADVANCED_OPTIONS], state.get(ADVANCED_OPTIONS, None), None, statePromptOptions.get(ADVANCED_OPTIONS, None))
    if bool(state[ADVANCED_OPTIONS]):
        qc = qc + 1
        ipRegex = re.compile('^([0-9]{1,3}\\.){3}([0-9]{1,3})$')
        state[ANNOUNCED_IP_KEY_NAME]=collectOption(prompts[ANNOUNCED_IP_KEY_NAME], state.get(ANNOUNCED_IP_KEY_NAME, None), qc, statePromptOptions.get(ANNOUNCED_IP_KEY_NAME, None), lambda ip: None if re.fullmatch(ipRegex, ip) else 'Bad IP address')

        qc = qc + 1
        state[TRANSPORT_PROTOCOL]=collectOption(prompts[TRANSPORT_PROTOCOL], state.get(TRANSPORT_PROTOCOL, None), qc, statePromptOptions.get(TRANSPORT_PROTOCOL, None))

        qc=qc + 1
        portRegex = re.compile(r'^[0-9]+$')
        maxPort = 49151
        minPort = 1024
        state[SERVER_PORT]=collectOption(prompts[SERVER_PORT], state.get(SERVER_PORT, None), qc, statePromptOptions.get(SERVER_PORT, None), lambda port: None if re.fullmatch(portRegex, port) and int(port) >= minPort and int(port) <= maxPort else 'Invalid port number')

        qc=qc + 1
        state[API_PORT]=collectOption(prompts[API_PORT], state.get(API_PORT, None), qc, statePromptOptions.get(API_PORT, None), lambda port: None if re.fullmatch(portRegex, port) and int(port) >= minPort and int(port) <= maxPort else 'Invalid port number')

        qc = qc + 1
        state[SESSION_KEY_KEY_NAME]=collectOption(prompts[SESSION_KEY_KEY_NAME], state.get(SESSION_KEY_KEY_NAME, None), qc, statePromptOptions.get(SESSION_KEY_KEY_NAME, None))

        qc = qc + 1
        state[RTC_PORT_RANGE]=collectOption(prompts[RTC_PORT_RANGE], state.get(RTC_PORT_RANGE, None), qc, statePromptOptions.get(RTC_PORT_RANGE, None))
        a, b = state[RTC_PORT_RANGE].split('-')[0], state[RTC_PORT_RANGE].split('-')[1]
        state[RTC_MIN] = min(a,b)
        state[RTC_MAX] = max(a,b)

        qc = qc + 1
        state[DB_USER]=collectOption(prompts[DB_USER], state.get(DB_USER, None), qc, statePromptOptions.get(DB_USER, None))

        qc = qc + 1
        state[DB_PWD]=collectOption(prompts[DB_PWD], state.get(DB_PWD, None), qc, statePromptOptions.get(DB_PWD, None))
    else:
        setDefaultAdvancedOptions()

def setDefaultAdvancedOptions():
    state[DB_USER]=state.get(DB_USER, defaultState.get(DB_USER, None))
    state[DB_PWD]=state.get(DB_PWD, defaultState.get(DB_PWD, None))
    state[ANNOUNCED_IP_KEY_NAME]=state.get(ANNOUNCED_IP_KEY_NAME, defaultState.get(ANNOUNCED_IP_KEY_NAME, None))
    state[TRANSPORT_PROTOCOL]=state.get(TRANSPORT_PROTOCOL, defaultState.get(TRANSPORT_PROTOCOL, None))
    state[API_PORT]=state.get(API_PORT, defaultState.get(API_PORT, None))
    state[SESSION_KEY_KEY_NAME]=state.get(SESSION_KEY_KEY_NAME, defaultState.get(SESSION_KEY_KEY_NAME, '3000'))
    state[RTC_PORT_RANGE]=state.get(RTC_PORT_RANGE,defaultState.get(RTC_PORT_RANGE, None))
    a, b = state[RTC_PORT_RANGE].split('-')[0], state[RTC_PORT_RANGE].split('-')[1]
    state[RTC_MIN] = min(a,b)
    state[RTC_MAX] = max(a,b)
    state[SERVER_PORT]=state.get(SERVER_PORT, defaultState.get(SERVER_PORT, None))

def processTemplates():
    initScript=f"""
set -e

mongosh<<EOF
use admin
db.createUser({{
    user: '@@{DB_USER}',
    pwd: '@@{DB_PWD}',
    roles: [{{
    role: 'readWrite',
    db: 'chattr_db'
    }}]
}})
EOF

    """
    template=f"""
version: '3.2'

networks:
  backend:
  frontend:
  api:

services:
  db:
    networks:
      - backend
    image: mongo:5.0
    restart: always
    volumes:
        - ./.vols/mongo:/data/db
        - @@{INIT_DB_CONTAINER_SCRIPT_PATH}:/docker-entrypoint-initdb.d/init.sh:ro
    environment:
      - MONGO_DATA=/data/db
      #- MONGO_INIT_ROOT_USERNAME=chattr
      #- MONGO_INIT_ROOT_PASSWORD=chattr
      - MONGO_INITDB_DATABASE=chattr_db

  api:
    depends_on:
      - db
    restart: unless-stopped
    networks:
      - backend
      - api
    image: docker.io/brinestone/chattr-server:{version}
    environment:
      - SERVER_PORT=@@{API_PORT}
      - JWT_KEY=@@{SESSION_KEY_KEY_NAME}
      - NODE_ENV=production
      - DB_URI=mongodb://db:27017
      - DB_NAME=chattr_db
      - RTC_MIN_PORT=@@{RTC_MIN}
      - RTC_MAX_PORT=@@{RTC_MAX}
      - DTLS_CERT_PATH=
      - DTLS_PRIVATE_PATH=
      - TRANSPORT_PROTOCOL=@@{TRANSPORT_PROTOCOL}
      - ANNOUNCED_IP=@@{ANNOUNCED_IP_KEY_NAME}
    # Uncomment the 2 lines below to expose your API service
    #ports:
    #  - '@@{API_PORT}:@@{API_PORT}'
  
  web-client:
    depends_on:
      - api
    networks:
      - frontend
      - api
    image: brinestone/chattr-web-client:{version}
    ports:
      - '@@{SERVER_PORT}:80'
    volumes:
      - @@{NGINX_CONFIG_PATH}:/etc/nginx/nginx.conf:ro
    """

    nginxConfig=f"""
worker_processes 1;
events {{
    worker_connections 1024;
}}

http {{
    include mime.types;
    server {{
        listen 80;
        listen [::]:80;
        server_name @@{WEB_DOMAIN};

        location /api {{
            rewrite ^/api/(.*)$ /$1 break;
            proxy_pass http://api:@@{API_PORT};
        }}

        root /usr/share/nginx/html;
        error_page 404 index.html;
        index index.html;

        location / {{
            try_files $uri $uri/ index.html;
        }}
    }}
}}

    """
    composeFilePath = path.join(state[DROPDIR_KEY_NAME], 'docker-compose.yml')
    initScriptFilePath = path.join(state[DROPDIR_KEY_NAME], 'conf', 'init.sh')
    nginxConfFilePath = path.join(state[DROPDIR_KEY_NAME], 'conf', 'chattr.conf')
    state[INIT_DB_CONTAINER_SCRIPT_PATH]=initScriptFilePath
    state[NGINX_CONFIG_PATH]=nginxConfFilePath

    for key in list(state.keys()):
        template = template.replace(f'@@{key}', str(state[key]))
        initScript = initScript.replace(f'@@{key}', str(state[key]))
        nginxConfig = nginxConfig.replace(f'@@{key}', str(state[key]))
    
    del state[INIT_DB_CONTAINER_SCRIPT_PATH]

    dir = Path(path.dirname(initScriptFilePath))
    if not dir.exists():
        dir.mkdir(parents=True, exist_ok=True)
    with open(composeFilePath, 'w') as handle:
        handle.write(template)
    with open(initScriptFilePath, 'w') as handle:
        handle.write(initScript)
    with open(nginxConfFilePath, 'w') as handle:
        handle.write(nginxConfig)

def startEnvironment(Force=False):
    print('Starting environment...')
    cmd = ['docker-compose', '-p', 'chattr', '-f', path.join(state[DROPDIR_KEY_NAME], 'docker-compose.yml'), 'up', '--remove-orphans', '-d']
    if Force:
        cmd.append('--force-recreate')
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in iter(process.stdout.readline, ''):
            print(line, end='')
        process.stdout.close()
        process.wait()
        print('Environment setup successfully')
    except KeyboardInterrupt:
        print('Interrupted by user')

def run(Setup=False):
    if Setup:
        print('Initializing configuration...')
        collectOptions()
        processTemplates()
    startEnvironment(Force=Setup)

def main():
    loadState()
    parseArgs()
    run(Setup=bool(forceMode) or isFirstTime)
    if not isStateDefault():
        writeState()

def red(text):
    return f'\033[31m{text}\033[0m'

if __name__ == "__main__":
    forceMode = True
    main()
