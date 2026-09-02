using CK.Setup;
using CK.Testing;
using System.Threading.Tasks;
using NUnit.Framework;

using static CK.Testing.MonitorTestHelper;

namespace CK.Ng.AspNet.ActorChannel.Tests;

/// <summary>
/// Runs the jest tests of the <c>ActorChannel</c> provider.
/// <para>
/// No server is started: the specs drive a fake WebSocket installed on the global, so what is tested
/// is the dependency injection graph - the channel is injectable, there is exactly one of it, and
/// several services share it - without depending on a backend being up.
/// </para>
/// </summary>
[TestFixture]
public class NgActorChannelTests
{
    [Test]
    public async Task CK_Ng_AspNet_ActorChannel_Async()
    {
        var targetProjectPath = TestHelper.GetTypeScriptInlineTargetProjectPath();

        var configuration = TestHelper.CreateDefaultEngineConfiguration();
        configuration.FirstBinPath.Path = TestHelper.BinFolder;
        configuration.FirstBinPath.Assemblies.Add( "CK.Ng.AspNet.ActorChannel" );
        configuration.FirstBinPath.EnsureTypeScriptConfigurationAspect( targetProjectPath );
        await configuration.RunSuccessfullyAsync();

        await using var runner = TestHelper.CreateTypeScriptRunner( targetProjectPath );
        await TestHelper.SuspendAsync( resume => resume );
        runner.Run();
    }
}
