npm install
npm install -g aws-cdk esbuild
curl -L -o aws-sam-cli-linux-x86_64.zip https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install
rm aws-sam-cli-linux-x86_64.zip
rm -rf sam-installation