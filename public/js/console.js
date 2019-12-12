var velesDevConsole = {
    isInitialized: false,
    client: null,
    controller: null,
    animationDelay: 500,
    cmdDeferred: null,
    cmdResult: false,
    welcomeMessage: "Veles Core Websocket client version v0.18.1.2 \"Blockchain Barracuda\"\n"
        + " ____   ____     .__                _________  \n_\\___\\_/___/____ |  |   ____   _____\\_   ___ \\  ___________   ____  \n\\___________/__ \\|  | _/ __ \\ /  ___/    \\  \\/ /  _ \\_  __ \\_/ __ \\ \n   \\  Y  /\\  ___/|  |_\\  ___/ \\___ \\\\     \\___(  <_> )  | \\/\\  ___/ \n    \\___/  \\___  >____/\\___  >____  >\\______  /\\____/|__|    \\___  >\n               \\/          \\/     \\/        \\/                   \\/ \n"
        + "This feature is highly EXPERIMENTAL, please use at your own risk.\n"
        + "Type .help for more information about available commands.\n\n",

    init: function(websocketClient) {
        if (!this.isInitialized) {
            this.client = websocketClient;

            // Init dependencies first
            $.getScript( "js/jquery.console.js" ).done(function( script, textStatus ) {
                // Prepare Veles console
                console.log('VelesConsole: Loaded console library');
                var container = $('#dev-console');
                container.html('');
                velesDevConsole.controller = container.console({
                    promptLabel: 'VelesCore # ',
                    commandValidate: function(line){
                        //if (line == "") return false; // not needed - just like in unix console
                        return true;
                    },
                    commandHandle: velesDevConsole.handleCommand,
                    animateScroll: false,
                    promptHistory: true,
                    autofocus: true,
                    welcomeMessage: velesDevConsole.welcomeMessage
                });
                velesDevConsole.controller.promptText('.help');
            }); 
            // auto-focus when mouse over console
            $('#dev-console').mouseover(function() {
                if (velesDevConsole.isShown())
                    if (velesDevConsole.controller)
                        velesDevConsole.controller.focus();
            });

            this.isInitialized = true;
        }
    },

    handleCommand: function(line, report, prevResult = null) {
        if (line == "") 
            return true;

        if (line.trim()[0] == '.' || velesDevConsole.isInternalCommandAlias(line))
            velesDevConsole.handleInternalCommand(line, report, prevResult);

        else if (line.trim()[0] == ':') {   // special services
            var args = line.split('|')[0].trim().split(' ');
            var cmd = args.shift().trim();

            if (!args.length) {
                report(cmd + ': need at least one argument - method name')
                return;
            }

            velesDevConsole.handleServerCommand(args.join(' '), report, prevResult, cmd.replace(':', ''));
        }

        else
            velesDevConsole.handleServerCommand(line, report, prevResult, 'node');
    },

    isInternalCommandAlias: function(line) {
        var cmd = line.split('|')[0].trim().split(' ').shift().trim();
        var internalCommandAliases = ['exit', 'quit'];

        return (internalCommandAliases.indexOf(cmd) != -1);
    },

    handleInternalCommand: function(line, report, prevResult = null) {
        // Allow to chain multiple commands with pipe
        var args = line.split('|')[0].trim().split(' ');
        var cmd = args.shift().trim();

        if (cmd == '.clear') {
            report('');
            return velesDevConsole.controller.clearScreen();

        } else if (cmd == '.help') {
            return this.submitCommandResult(line, report, 
                "Internal console commands start with dot '.', all other commands are handled by the Veles Core daemon. \n"
                + "However, some commands might be disabled in the web console, such as commands directly related to wallet \n"
                + "manipulation or payment handling.\n\n"
                + "Redirect of output using pipes is also supported. You can connect two or more commands so that the output \n"
                + "of one command is used as the input of another command. The commands can be connected by a pipe (|) symbol. \n"
                + "For example: 'getbestblockhash | getblock' or 'masternode list | .grep ENABLED'.\n\n"
                + "== Internal console commands ==\n"
                + ".clear      Clear the console\n"
                + ".close      Close console window\n"
                + ".grep       Search for PATTERN in COMMAND output.\n"
                + ".help       Display this help text\n"
                + ".max        Maximize console window to full size\n"
                + ".min        Shrink console window to minimum size\n"
                + "\n== Veles Core daemon commands ==\n"
                + "For list of Veles Core daemon commands please run: 'help'\n\n"
                );

        } else if (cmd == '.grep') {
            if (prevResult) {
                if (args.length < 1)
                    return report("Usage: COMMAND | .grep PATTERN");

                return this.submitCommandResult(line, report, $.grep(
                    prevResult.split("\n"), 
                    function(n, i) {
                        return n.indexOf(args[0]) != -1; 
                        }
                    ).join("\n"));
            } else {
                return report("Usage: COMMAND | .grep PATTERN");
            }

            return this.submitCommandResult(line, report, '');

        } else if (cmd == '.max') {
            if ($('.footer-overlay').hasClass('panel-maximize')) {
                report('.max: console window has already maximal size, press [F11] to enter full-screen mode');
            } else {
                $('.footer-overlay').addClass('panel-maximize');
                report('');
            }
            return;

        } else if (cmd == '.min') {
            if (!$('.footer-overlay').hasClass('panel-maximize')) {
                report('.min: console window has already minimal size, use .close to completely close the window.');
            } else {
                $('.footer-overlay').removeClass('panel-maximize');
                report('');
            }
            return;

        } else if (cmd == '.close') {
            this.hide();
            report('');
            return;

        // support all combinations like .exit, exit, .quit, quit ...
        } else if (cmd.replace('.', '') == 'exit' || cmd.replace('.', '') == 'quit') {
            report('[ Exited ]');
            velesDevConsole.controller.clearScreen();
            this.hide();
            return;
        }

        return velesDevConsole.handleCommandNotFound(line, report);
    },

    handleServerCommand: function(line, report, prevResult = null, service = 'node') {
        // Allow to chain multiple commands with pipe
        var cmdLine = line.split('|')[0].trim();

        if (prevResult)     // if previous result has multiple lines, use just the first one
            cmdLine += ' ' + prevResult.split("\n")[0].trim();

        this.client.get_cmd_result(service, cmdLine, {}, function(data) {
            // depends on current API impl
            if (data && data.hasOwnProperty('error')) {  // Veles node errors
                if (data['error'].hasOwnProperty('code') && data['error']['code'] == -32601)
                    return velesDevConsole.handleCommandNotFound(cmdLine, report);
                else
                    return velesDevConsole.handleError(cmdLine, report, data['error']);

            } else if (data && data.hasOwnProperty('message-type') && data['message-type'] == 'error') {  // Websocket server errors
                if (data['name'] == 'commandNotFound')
                    return velesDevConsole.handleCommandNotFound(cmdLine, report);
                else
                    return velesDevConsole.handleError(cmdLine, report, data['error']);
            }

            return velesDevConsole.submitCommandResult(line, report, (typeof data == 'object')
                ? JSON.stringify(data, null, 4)
                : data.toString()
                );
        });
    },

    handleCommandNotFound: function(line, report) {
        var cmdName = line.split(' ')[0];
        var cmdSuggestion = null;

        if (cmdName == 'clear')
            cmdSuggestion = "Command '.clear' from console internal commands";

        else if (cmdName == 'grep')
            cmdSuggestion = "Command '.grep' from console internal commands";

        else if (cmdName == 'max' || cmdName.indexOf('max') != -1)
            cmdSuggestion = "Command '.max' from console internal commands";

         else if (cmdName == 'min' || cmdName.indexOf('min') != -1)
            cmdSuggestion = "Command '.min' from console internal commands";

        report(((cmdSuggestion) ? "No command '" + cmdName + "' found, did you mean:\n " + cmdSuggestion + "\n"  : '')
            + cmdName + ': command not found');
    },

    handleError: function(line, report, error) {
        var cmdName = line.split(' ')[0];

        if (error.hasOwnProperty('message'))
            report(cmdName + ": " + error['message']);

        else if (error.hasOwnProperty('code'))
            report(cmdName + ": error code: " + error['code']);

        else
            report(cmdName + ": error executing command");
    },

    submitCommandResult(line, report, result) {
        var pipeSeparated = line.split('|');
        pipeSeparated.shift();

        if (pipeSeparated.length)
            return this.handleCommand(pipeSeparated.join('|'), report, result);

        return report(result);
    },

    show: function() {
        //velesSinglePageApp.hideMobileSlider();
        $('#dev-console').show();
        $('.footer-overlay').addClass('footer-panel-expand');
        $('.footer').addClass('footer-panel-expand');   /* for tooltips to adjust height */
        $('body').addClass('with-overlay');
        $('#mobile-follow-toggle').addClass('inactive');
        $('.console-area').show();
        $('#console-toggle').add('.console-area').addClass('active'); 

        if (!$('.sidebar').hasClass('sidebar-expand'))
            $('.sidebar').fadeOut();   // hide sidebar same as scrollbar does if not expanded ...

        if (this.controller)
            this.controller.focus();
    },

    hide: function() {
        $('.footer-overlay').removeClass('footer-panel-expand');
        $('.footer').removeClass('footer-panel-expand');
        $('body').removeClass('with-overlay');
        $('#mobile-follow-toggle').removeClass('inactive');
        $('.console-area').hide();
        $('#console-toggle').add('.console-area').removeClass('active');

        if (!$('.sidebar').hasClass('sidebar-expand'))
            $('.sidebar').fadeIn();

        window.setTimeout(function(){
            $('#dev-console').hide();
        }, 500);    // duration of the animation
    },

    isShown: function() {
          return $('.footer-overlay').hasClass('footer-panel-expand');
    },

    bindToggle: function(selector, websocketClient) {
        $(selector).click(function() {
            window.setTimeout(function() {
                velesDevConsole.init(websocketClient);
            }, velesDevConsole.animationDelay);

            if (velesDevConsole.isShown())
                velesDevConsole.hide();
            else
                velesDevConsole.show();
        });
        /* BInd other elements if present */
        $('#console-maximize').click(function() {
            if ($('.footer-overlay').hasClass('panel-maximize')) {
                $('.footer-overlay').removeClass('panel-maximize');
                $('.footer').removeClass('panel-maximize');
            } else {
                $('.footer-overlay').addClass('panel-maximize');
                $('.footer').addClass('panel-maximize');
            }
        });
    },
}

velesDevConsole.bindToggle('#console-toggle', velesSocketClient);
